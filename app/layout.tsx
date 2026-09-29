import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_TITLE } from "@/lib/schedule/board-day";
import { VENUE_NAME, VENUE_TAGLINE } from "@/lib/venue";

import "./globals.css";

/**
 * Outfit, self hosted at build time (spec 0003, AC-15). `next/font` downloads the
 * files during the build and serves them from our own origin, so no visitor's
 * address ever reaches a font host. `app/globals.css` maps the variable to both
 * `font-sans` and `font-heading`.
 */
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute URLs for the generated social card. Without it Next falls back to
  // localhost, and a shared link unfurls with a picture nobody else can load.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: DEFAULT_TITLE,
    template: `%s · ${VENUE_NAME}`,
  },
  description: VENUE_TAGLINE,
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} h-full antialiased`}>
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
