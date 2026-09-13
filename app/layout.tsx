import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";

import { Toaster } from "@/components/ui/sonner";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
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
 * Both schemes are supported and the default follows the device. Telling the
 * browser so is what stops the flash of a white page before the stylesheet lands
 * on a device set to dark.
 */
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffbea" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1712" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The reader's theme choice, read on the server so the very first paint is
  // already the right one. `system` stamps nothing and the media query decides,
  // which keeps the no toggle behaviour of spec 0003 as the default.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      data-theme={theme === "system" ? undefined : theme}
      className={`${inter.variable} h-full antialiased`}
    >
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
