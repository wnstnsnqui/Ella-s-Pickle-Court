import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Join class names and let a later Tailwind utility win over an earlier one.
 *
 * Every component in this project uses it, so a caller can pass a layout class
 * without fighting the component's own classes. Spec 0003.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
