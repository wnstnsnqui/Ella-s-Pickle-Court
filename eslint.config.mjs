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

/**
 * The landing look rule for spec 0018, AC-17.
 *
 * Every transition names its properties (AC-14), and surfaces are round
 * (`rounded-2xl`, `rounded-3xl`, `rounded-full`, `rounded-cell`), so the two
 * small radii and `transition-all` mark a screen still in the old face. A
 * class only, with or without a variant (`sm:rounded-lg`). The look, never the
 * formatting: Prettier still owns layout.
 */
const OLD_LOOK = "(?:^|\\s|:)(?:transition-all|rounded-(?:md|lg))(?=$|\\s)";
const oldLookMessage =
  "Spec 0018, AC-17: name the transition's properties (or use `press`), and use the landing's radii (rounded-2xl, rounded-3xl, rounded-full, rounded-cell) or a recipe (surface-card).";

const lookDiscipline = [
  { selector: `Literal[value=/${OLD_LOOK}/]`, message: oldLookMessage },
  { selector: `TemplateElement[value.raw=/${OLD_LOOK}/]`, message: oldLookMessage },
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
    // The look rule joins the token rule everywhere a screen is built, except
    // the registry primitives, the frozen landing, the design page, and the
    // shared modules the landing imports, which AC-1 forbids changing.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: [
      "**/*.test.ts",
      "components/ui/**",
      "components/landing/**",
      "app/(landing)/**",
      "app/design/**",
      "components/wordmark.tsx",
      "components/staff/confirm-dialog.tsx",
      "components/receipt/**",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...tokenDiscipline, ...lookDiscipline],
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
    // Supabase Edge Functions run on Deno, outside the Next build (spec 0015).
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
