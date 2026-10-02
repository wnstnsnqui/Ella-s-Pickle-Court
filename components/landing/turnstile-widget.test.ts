// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { createElement, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TurnstileWidget } from "./turnstile-widget";

// `next/script` is replaced so each test decides when the script loads or fails.
type ScriptProps = { src: string; onReady?: () => void; onError?: () => void };
let script: ScriptProps | null = null;
vi.mock("next/script", () => ({
  default: (props: ScriptProps) => {
    script = props;
    return null;
  },
}));

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type RenderOptions = {
  sitekey: string;
  action: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "error-callback": () => boolean;
};

/** A stand in for Cloudflare's API that records every call. */
function fakeTurnstile() {
  let next = 0;
  const api = {
    render: vi.fn<(box: HTMLElement, options: RenderOptions) => string>(() => `widget-${++next}`),
    reset: vi.fn<(id: string) => void>(),
    remove: vi.fn<(id: string) => void>(),
  };
  window.turnstile = api;
  return api;
}

function setup(attempt = 0) {
  const props = {
    siteKey: "1x00000000000000000000AA",
    action: "booking_hold",
    attempt,
    onToken: vi.fn(),
    onFail: vi.fn(),
  } satisfies ComponentProps<typeof TurnstileWidget>;
  const view = render(createElement(TurnstileWidget, props));
  const rerender = (next: Partial<typeof props>) =>
    view.rerender(createElement(TurnstileWidget, { ...props, ...next }));
  return { ...view, props, rerender };
}

// The `<script>` tags the widget adds by hand for the retry after a load
// failure, caught before they reach the page so nothing is ever fetched.
let appended: Node[] = [];
function addedScripts() {
  return appended.filter(
    (node): node is HTMLScriptElement =>
      node instanceof HTMLScriptElement && node.src === SCRIPT_SRC,
  );
}

beforeEach(() => {
  script = null;
  appended = [];
  vi.spyOn(document.head, "appendChild").mockImplementation(<T extends Node>(node: T) => {
    appended.push(node);
    return node;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window.turnstile;
});

describe("TurnstileWidget", () => {
  it("renders a managed widget with the site key and the hold action once the script is ready (AC-3)", () => {
    const turnstile = fakeTurnstile();
    setup();

    act(() => script?.onReady?.());

    expect(turnstile.render).toHaveBeenCalledTimes(1);
    const options = turnstile.render.mock.calls[0][1];
    expect(options.sitekey).toBe("1x00000000000000000000AA");
    expect(options.action).toBe("booking_hold");
  });

  it("renders straight away when the script is already on the page from an earlier card", () => {
    const turnstile = fakeTurnstile();

    setup();

    expect(turnstile.render).toHaveBeenCalledTimes(1);
  });

  it("hands each token up, and null when the token expires or times out", () => {
    const turnstile = fakeTurnstile();
    const { props } = setup();
    const options = turnstile.render.mock.calls[0][1];

    options.callback("token-1");
    options["expired-callback"]();
    options["timeout-callback"]();

    expect(props.onToken.mock.calls).toEqual([["token-1"], [null], [null]]);
  });

  it("reports a widget error to the card and handles it so Turnstile does not throw (AC-7)", () => {
    const turnstile = fakeTurnstile();
    const { props } = setup();

    const handled = turnstile.render.mock.calls[0][1]["error-callback"]();

    expect(handled).toBe(true);
    expect(props.onToken).toHaveBeenCalledWith(null);
    expect(props.onFail).toHaveBeenCalledTimes(1);
  });

  it("uses the latest handlers when Turnstile calls back after a rerender", () => {
    const turnstile = fakeTurnstile();
    const { rerender } = setup();
    const onToken = vi.fn();

    rerender({ onToken });
    turnstile.render.mock.calls[0][1].callback("token-2");

    expect(onToken).toHaveBeenCalledWith("token-2");
  });

  it("resets the widget for a fresh token when the card bumps the attempt after a hold call", () => {
    const turnstile = fakeTurnstile();
    const { rerender } = setup(0);

    rerender({ attempt: 1 });

    expect(turnstile.reset).toHaveBeenCalledTimes(1);
    expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
  });

  it("does not reset on first show, before any hold call", () => {
    const turnstile = fakeTurnstile();

    setup(0);

    expect(turnstile.reset).not.toHaveBeenCalled();
  });

  // Regression (/debug 2026-10-02): back on Terms after a hold, the widget was
  // rendered and reset in the same tick, and never issued a token.
  it("does not reset a widget it has just rendered when shown again after a hold (AC-5)", () => {
    const turnstile = fakeTurnstile();

    setup(1);

    expect(turnstile.render).toHaveBeenCalledTimes(1);
    expect(turnstile.reset).not.toHaveBeenCalled();
  });

  it("still resets on the next hold call after being shown again (AC-5)", () => {
    const turnstile = fakeTurnstile();
    const { rerender } = setup(1);

    rerender({ attempt: 2 });

    expect(turnstile.reset).toHaveBeenCalledTimes(1);
    expect(turnstile.reset).toHaveBeenCalledWith("widget-1");
  });

  it("removes its widget when the Terms step goes away", () => {
    const turnstile = fakeTurnstile();
    const { unmount } = setup();

    unmount();

    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
  });

  it("tells the card when the script fails to load (AC-7)", () => {
    const { props } = setup();

    act(() => script?.onError?.());

    expect(props.onFail).toHaveBeenCalledTimes(1);
  });

  // Regression (/debug 2026-10-02): `next/script` loads a src once per page,
  // so the quiet retry never loaded anything and the second failure never came.
  it("loads the script again on the quiet retry after a load failure (AC-7)", () => {
    const { rerender } = setup(0);
    act(() => script?.onError?.());

    rerender({ attempt: 1 });

    expect(addedScripts()).toHaveLength(1);
  });

  it("reports a second load failure, so the card can say it can't continue (AC-7)", () => {
    const { props, rerender } = setup(0);
    act(() => script?.onError?.());
    rerender({ attempt: 1 });

    act(() => {
      addedScripts()[0].dispatchEvent(new Event("error"));
    });

    expect(props.onFail).toHaveBeenCalledTimes(2);
  });

  it("renders the widget when the retried script loads (AC-7)", () => {
    const { rerender } = setup(0);
    act(() => script?.onError?.());
    rerender({ attempt: 1 });
    const turnstile = fakeTurnstile();

    act(() => {
      addedScripts()[0].dispatchEvent(new Event("load"));
    });

    expect(turnstile.render).toHaveBeenCalledTimes(1);
  });

  it("does not load the script by hand when it simply has not finished loading yet", () => {
    const { rerender } = setup(0);

    rerender({ attempt: 1 });

    expect(addedScripts()).toHaveLength(0);
  });
});
