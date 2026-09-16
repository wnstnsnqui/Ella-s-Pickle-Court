"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

import { posthogConfigured } from "@/lib/env";

/**
 * Catches a throw in the root layout itself. Spec 0009, AC-6.
 *
 * This replaces the whole document, so it renders its own `<html>` and
 * `<body>` and cannot rely on `globals.css` having loaded; every colour here
 * is inline rather than a Tailwind token.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (posthogConfigured) posthog.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#fafafa",
          color: "#1a1a1a",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 500, marginBottom: "0.5rem" }}>
            Something went wrong on our side
          </h1>
          <p style={{ color: "#666", marginBottom: "1rem" }}>
            Try again, or come back to the board.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                border: "none",
                backgroundColor: "#1a1a1a",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- this
                replaces the whole document outside the router tree, exactly where
                Next's own docs say a plain anchor is correct. */}
            <a
              href="/"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                border: "1px solid #ccc",
                color: "#1a1a1a",
                textDecoration: "none",
              }}
            >
              Back to today
            </a>
          </div>
          {error.digest && (
            <p style={{ color: "#999", fontSize: "0.75rem", marginTop: "0.75rem" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
