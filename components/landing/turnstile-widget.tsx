"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile on the Terms step. Spec 0015, AC-3 and AC-7.
 *
 * Rendered explicitly so this surface keeps its own widget id: a token is
 * single use, so after every hold call the sheet bumps `attempt` and the
 * widget resets for a fresh one. Managed mode, so most players see a short
 * check that passes by itself.
 */

type TurnstileWidgetId = string;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "auto";
      size: "flexible";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "timeout-callback": () => void;
      "error-callback": () => boolean;
    },
  ) => TurnstileWidgetId;
  reset: (widgetId: TurnstileWidgetId) => void;
  remove: (widgetId: TurnstileWidgetId) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function TurnstileWidget({
  siteKey,
  action,
  attempt,
  onToken,
  onFail,
}: {
  siteKey: string;
  action: string;
  /** Bumped by the sheet after each hold call, so the spent token is replaced. */
  attempt: number;
  /** A fresh token, or null when the last one expired. */
  onToken: (token: string | null) => void;
  /** The widget failed to load or to run. The sheet decides whether to retry (AC-7). */
  onFail: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<TurnstileWidgetId | null>(null);
  // The attempt the current widget was rendered for. A widget rendered after
  // the bump (the Terms step shown again after a hold) is already fresh, and
  // resetting it in the same tick stops it ever issuing a token.
  const attemptNow = useRef(attempt);
  const renderedFor = useRef<number | null>(null);
  // The script failed to load, so a retry has to load it again (AC-7).
  const loadFailed = useRef(false);
  // The latest handlers, for callbacks Turnstile holds on to between renders.
  const handlers = useRef({ onToken, onFail });
  useEffect(() => {
    handlers.current = { onToken, onFail };
    attemptNow.current = attempt;
  }, [onToken, onFail, attempt]);

  const render = useCallback(() => {
    if (!box.current || widgetId.current !== null || !window.turnstile) return;
    renderedFor.current = attemptNow.current;
    widgetId.current = window.turnstile.render(box.current, {
      sitekey: siteKey,
      action,
      theme: "auto",
      size: "flexible",
      callback: (token) => handlers.current.onToken(token),
      "expired-callback": () => handlers.current.onToken(null),
      "timeout-callback": () => handlers.current.onToken(null),
      "error-callback": () => {
        handlers.current.onToken(null);
        handlers.current.onFail();
        // Handled here, so Turnstile does not also throw it to the console.
        return true;
      },
    });
  }, [siteKey, action]);

  // The script may already be on the page from an earlier sheet.
  useEffect(() => {
    render();
    return () => {
      if (widgetId.current !== null) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [render]);

  useEffect(() => {
    if (widgetId.current === null) {
      // `next/script` loads a src once per page, so the quiet retry loads it
      // again by hand; a second failure is what tells the sheet to give up.
      if (attempt === 0 || !loadFailed.current) return;
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        loadFailed.current = false;
        render();
      };
      script.onerror = () => handlers.current.onFail();
      document.head.appendChild(script);
      return;
    }
    if (renderedFor.current === attempt) return;
    renderedFor.current = attempt;
    window.turnstile?.reset(widgetId.current);
  }, [attempt, render]);

  return (
    <>
      <Script
        src={SCRIPT_SRC}
        strategy="afterInteractive"
        onReady={render}
        onError={() => {
          loadFailed.current = true;
          handlers.current.onFail();
        }}
      />
      <div ref={box} className="min-h-16" />
    </>
  );
}
