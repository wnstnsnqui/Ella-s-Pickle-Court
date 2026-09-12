/**
 * Formatting is not a matter of taste here: it is settled once so no later slice
 * spends a review argueing about it. Everything not listed is Prettier's default.
 *
 * @type {import("prettier").Config}
 */
const config = {
  // Wider than the 80 column default. Server Actions and Supabase chains read
  // badly when they are wrapped this early.
  printWidth: 100,
  // Sorts Tailwind classes into the order Tailwind itself uses, so two people
  // writing the same tile do not produce two different diffs.
  plugins: ["prettier-plugin-tailwindcss"],
};

export default config;
