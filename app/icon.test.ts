import { describe, expect, it } from "vitest";

import Icon, { contentType, size } from "./icon";

/**
 * Spec 0003, AC-16: the favicon is generated from a letter, so no image file
 * ships in the repo. `next/og` draws it, and drawing is the boundary, so the test
 * checks the response it returns rather than the pixels.
 */

describe("icon", () => {
  it("declares a 32 by 32 PNG, the size a favicon slot expects (AC-16)", () => {
    expect(size).toEqual({ width: 32, height: 32 });
    expect(contentType).toBe("image/png");
  });

  it("returns an image response with the declared PNG type (AC-16)", async () => {
    const response = Icon();
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("produces real PNG bytes rather than an empty body", async () => {
    const bytes = new Uint8Array(await Icon().arrayBuffer());
    // PNG magic number
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
