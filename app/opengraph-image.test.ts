import { describe, expect, it } from "vitest";

import { VENUE_NAME, VENUE_TAGLINE } from "@/lib/venue";

import OpengraphImage, { alt, contentType, size } from "./opengraph-image";

/**
 * Spec 0003, AC-16: the social card is generated from text at request time, and
 * everything on it comes from `lib/venue`, so renaming the venue is one edit.
 */

describe("opengraph-image", () => {
  it("declares the standard 1200 by 630 PNG card (AC-16)", () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
  });

  it("describes the card with the venue name and tagline, from the one constant (AC-16)", () => {
    expect(alt).toContain(VENUE_NAME);
    expect(alt).toContain(VENUE_TAGLINE);
  });

  it("returns an image response with the declared PNG type (AC-16)", () => {
    const response = OpengraphImage();
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("produces real PNG bytes rather than an empty body", async () => {
    const bytes = new Uint8Array(await OpengraphImage().arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
