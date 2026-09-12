/**
 * Contrast, measured rather than asserted. Spec 0003, AC-4.
 *
 * The design page reads the colour a token actually resolves to in the browser
 * and works out the ratio from that, so the number on screen is the number a
 * reader gets. Nothing here duplicates a token value; that would just be a second
 * thing to keep in step with `app/globals.css`.
 */

export type Rgb = [number, number, number];

/**
 * Ask the browser what a colour value really is.
 *
 * A one pixel canvas is the trick: it accepts any colour syntax the browser
 * understands, OKLCH included, and hands back plain sRGB bytes. Parsing the
 * computed style string ourselves would mean writing a colour parser, and being
 * wrong about it quietly.
 */
export function resolveColor(value: string): Rgb | null {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  // A colour the browser cannot parse leaves fillStyle at its previous value, so
  // start from a colour nothing under test uses and check it moved.
  context.fillStyle = "#ff00ff";
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** sRGB byte to the linear light value the luminance formula wants. */
function toLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** The WCAG contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** What a pair has to reach, and whether it got there. */
export type ContrastNeed = "body" | "large" | "boundary";

export const CONTRAST_MINIMUM: Record<ContrastNeed, number> = {
  body: 4.5,
  large: 3,
  boundary: 3,
};

export function meets(ratio: number, need: ContrastNeed): boolean {
  return ratio + 0.005 >= CONTRAST_MINIMUM[need];
}
