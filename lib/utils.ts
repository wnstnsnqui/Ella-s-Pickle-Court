import { createCn } from "cn/config";

/**
 * Join class names and let a later Tailwind utility win over an earlier one.
 *
 * Every component in this project uses it, so a caller can pass a layout class
 * without fighting the component's own classes. Spec 0003.
 *
 * The merger only knows Tailwind's own scales. Taught the project's six type
 * steps, `text-label` reads as a font size rather than a colour, so it survives
 * next to `text-muted-foreground` instead of one silently dropping the other.
 *
 * Taught the `press` recipe (spec 0018, `app/globals.css`) too: it sets the
 * transition, so `press` on a `Button` drops the button's own `transition-all`
 * rather than leaving the two to fight over CSS order.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["hero", "headline", "display", "title", "body", "label", "cell", "caption"] },
      ],
      transition: ["press"],
    },
  },
});
