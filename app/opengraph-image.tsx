import { ImageResponse } from "next/og";

import { VENUE_INITIAL, VENUE_NAME, VENUE_TAGLINE } from "@/lib/venue";

/**
 * The card a link to this venue unfurls into. Spec 0003, AC-16: generated from
 * text at request time, so there is no image file to ship, and no designer needed
 * the day the venue's name or line changes.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${VENUE_NAME} · ${VENUE_TAGLINE}`;

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#fcfcfc",
        color: "#26282e",
        padding: 72,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 72,
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#26282e",
            color: "#fcfcfc",
            fontSize: 44,
            fontWeight: 600,
            borderRadius: 16,
          }}
        >
          {VENUE_INITIAL}
        </div>
        <div style={{ fontSize: 44, fontWeight: 600 }}>{VENUE_NAME}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 64, fontWeight: 600, lineHeight: 1.1 }}>{VENUE_TAGLINE}</div>
        <div style={{ fontSize: 30, color: "#6b6e76" }}>
          Booked · Available · Unavailable, hour by hour, live.
        </div>
      </div>
    </div>,
    size,
  );
}
