import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
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

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#fffbea",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {/* Clerk 7 wants its provider inside body, so its modals mount there. */}
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
