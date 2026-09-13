"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, THEMES, type Theme } from "@/lib/theme";

const LABEL: Record<Theme, string> = {
  system: "Follows your device",
  light: "Light",
  dark: "Dark",
};

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/**
 * One button that walks device → light → dark → device.
 *
 * It sets `data-theme` on `<html>` straight away, so the change is instant, and
 * writes the same value to a cookie so the server paints the right theme on the
 * next request. `system` clears the attribute and lets the media query decide,
 * which is exactly the behaviour the app had before the toggle existed.
 */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  const Icon = ICON[theme];

  function apply(value: Theme) {
    setTheme(value);
    const root = document.documentElement;
    if (value === "system") delete root.dataset.theme;
    else root.dataset.theme = value;
    document.cookie = `${THEME_COOKIE}=${value}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => apply(next)}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next].toLowerCase()}`}
      title={`Theme: ${LABEL[theme]}`}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
