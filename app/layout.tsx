import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { VENUE_NAME, VENUE_TAGLINE } from "@/lib/venue";

import "./globals.css";
import { Providers } from "./providers";

/**
 * Inter, self hosted at build time (spec 0003, AC-15). `next/font` downloads the
 * files during the build and serves them from our own origin, so no visitor's
 * address ever reaches a font host. Geist is gone with the starter.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute URLs for the generated social card. Without it Next falls back to
  // localhost, and a shared link unfurls with a picture nobody else can load.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: `${VENUE_NAME} · Court schedule`,
    template: `%s · ${VENUE_NAME}`,
  },
  description: VENUE_TAGLINE,
};

/**
 * AC-1: dark follows the device setting with no toggle. Telling the browser both
 * schemes are supported is what stops the flash of a white page before the
 * stylesheet lands on a device set to dark.
 */
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfc" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1c20" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <Providers>
      <html lang="en" className={`${inter.variable} h-full antialiased`}>
        <body className="bg-background text-foreground flex min-h-full flex-col">{children}</body>
      </html>
    </Providers>
  );
}
