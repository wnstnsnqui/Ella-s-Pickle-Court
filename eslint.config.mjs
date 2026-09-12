import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/**
 * The design token rule for spec 0003.
 *
 * Invariant 1: a colour appears once, in `app/globals.css`. Invariant 2: a
 * component never names a theme, because the semantic token already carries
 * both. These two patterns catch the ways that gets broken in practice: reaching
 * for a Tailwind palette colour, and hand writing a `dark:` pair.
 *
 * `transparent`, `current` and `inherit` are keywords rather than colours, so
 * they stay allowed. This is about tokens, never about formatting: Prettier still
 * owns layout, per the rule in `AGENTS.md`.
 */
const PALETTE =
  "(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const PROPERTY =
  "(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide|placeholder)";
const RAW_COLOR = `${PROPERTY}-(?:white|black|${PALETTE}-\\d{2,3})`;
const DARK_VARIANT = "dark:";

const rawColorMessage =
  "Raw Tailwind colour. Spec 0003 invariant 1: every colour is a semantic token from app/globals.css (bg-background, text-muted-foreground, bg-state-booked).";
const darkVariantMessage =
  "No `dark:` colour overrides. Spec 0003 invariant 2: the semantic token already carries both themes, so a component never names one.";

const tokenDiscipline = [
  { selector: `Literal[value=/${RAW_COLOR}/]`, message: rawColorMessage },
  { selector: `TemplateElement[value.raw=/${RAW_COLOR}/]`, message: rawColorMessage },
  { selector: `JSXText[value=/${RAW_COLOR}/]`, message: rawColorMessage },
  { selector: `Literal[value=/${DARK_VARIANT}/]`, message: darkVariantMessage },
  { selector: `TemplateElement[value.raw=/${DARK_VARIANT}/]`, message: darkVariantMessage },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...tokenDiscipline],
    },
  },
  {
    // The one exception spec 0003 allows: the design page demonstrates what a
    // token resolves to, and showing both themes side by side is its whole job.
    files: ["app/design/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // Stands down every ESLint rule that only argues about formatting, so ESLint
  // catches real problems and Prettier owns the layout. Must stay last.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
