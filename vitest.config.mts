import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Minimal Vitest setup for the logic layer.
 *
 * No jsdom and no component testing yet: the only components in the tree today are
 * a placeholder page and the throwaway smoke slice that feature 3 deletes. Add
 * jsdom and Testing Library when feature 4 lands the real design system.
 */
export default defineConfig({
  resolve: {
    alias: {
      // The same `@/` root Next.js and tsconfig use.
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only` throws on purpose when imported outside a server component.
      // The package ships an empty build for exactly this case, but does not list
      // it in its exports field, so point at the file directly.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
});
