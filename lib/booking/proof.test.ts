import { afterEach, describe, expect, it, vi } from "vitest";

import { fitWithin, proofFileProblem, shrinkProof, uploadProof } from "./proof";

/** Spec 0015, AC-8 and AC-9: the field refuses before any upload, and the shrink never enlarges. */

const MB = 1024 * 1024;

describe("proofFileProblem", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("accepts %s up to 10 MB", (type) => {
    expect(proofFileProblem({ type, size: 10 * MB })).toBeNull();
  });

  it.each(["image/gif", "image/heic", "application/pdf", ""])("refuses %s", (type) => {
    expect(proofFileProblem({ type, size: MB })).toMatch(/PNG, JPEG or WebP/);
  });

  it("refuses a file over 10 MB", () => {
    expect(proofFileProblem({ type: "image/png", size: 10 * MB + 1 })).toMatch(/over 10 MB/);
  });
});

describe("fitWithin", () => {
  it("shrinks a tall phone screenshot so its long edge is 1600", () => {
    expect(fitWithin(1179, 2556)).toEqual({ width: 738, height: 1600 });
  });

  it("shrinks a wide image by its width", () => {
    expect(fitWithin(3200, 1800)).toEqual({ width: 1600, height: 900 });
  });

  it("leaves a small image alone", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

/**
 * A canvas that answers `toBlob` with whatever the browser is pretended to
 * encode: a browser that cannot write WebP quietly hands back a PNG.
 */
function fakeBrowser({ encodes }: { encodes: string[] }) {
  const drawn: { width: number; height: number }[] = [];
  const close = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: "",
      fillRect: vi.fn(),
      drawImage: (_: unknown, __: number, ___: number, width: number, height: number) =>
        drawn.push({ width, height }),
    }),
    toBlob: (done: (blob: Blob | null) => void, type: string) =>
      done(new Blob(["x"], { type: encodes.includes(type) ? type : "image/png" })),
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 1179, height: 2556, close })),
  );
  return { drawn, close };
}

describe("shrinkProof", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("draws at most 1600 pixels on the long edge and encodes WebP", async () => {
    const browser = fakeBrowser({ encodes: ["image/webp", "image/jpeg"] });
    const blob = await shrinkProof(new Blob(["png"], { type: "image/png" }));
    expect(blob.type).toBe("image/webp");
    expect(browser.drawn).toEqual([{ width: 738, height: 1600 }]);
    expect(browser.close).toHaveBeenCalled();
  });

  it("falls back to JPEG where the browser cannot encode WebP (Safari)", async () => {
    fakeBrowser({ encodes: ["image/jpeg"] });
    const blob = await shrinkProof(new Blob(["png"], { type: "image/png" }));
    expect(blob.type).toBe("image/jpeg");
  });

  it("throws, and still frees the bitmap, when it can encode neither", async () => {
    const browser = fakeBrowser({ encodes: [] });
    await expect(shrinkProof(new Blob(["png"]))).rejects.toThrow(/could not encode/);
    expect(browser.close).toHaveBeenCalled();
  });
});

describe("uploadProof", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("PUTs to the signed URL with the real content type, overwriting (AC-9)", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const proof = new Blob(["x"], { type: "image/webp" });
    await uploadProof("https://example.supabase.co/signed", proof);
    expect(fetch).toHaveBeenCalledWith("https://example.supabase.co/signed", {
      method: "PUT",
      headers: { "content-type": "image/webp", "x-upsert": "true" },
      body: proof,
    });
  });

  it("throws on a refusal, so the step can offer Retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    await expect(uploadProof("https://example.supabase.co/signed", new Blob())).rejects.toThrow(
      /403/,
    );
  });
});
