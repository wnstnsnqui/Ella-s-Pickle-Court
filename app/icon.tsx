import { ImageResponse } from "next/og";

import { VENUE_INITIAL } from "@/lib/venue";

/**
 * The favicon, generated from a letter. Spec 0003, AC-16: the system ships no
 * image assets, so the mark is type on the ink colour, drawn at build time.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1c1917",
        color: "#ffc61a",
        fontSize: 22,
        fontWeight: 600,
        borderRadius: 7,
      }}
    >
      {VENUE_INITIAL}
    </div>,
    size,
  );
}
