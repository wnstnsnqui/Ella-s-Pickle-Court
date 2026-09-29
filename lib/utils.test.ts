import { describe, expect, it } from "vitest";

import { cn } from "./utils";

/**
 * Spec 0003: `cn` joins classes and lets a later Tailwind utility win, and it
 * knows the project's six step type scale, so a type step and a colour are
 * never mistaken for one another.
 */
describe("cn", () => {
  it("joins classes and drops falsy values", () => {
    expect(cn("flex", false, undefined, null, "gap-2")).toBe("flex gap-2");
  });

  it("lets a later utility win over an earlier one of the same kind", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("keeps a type step next to a text colour, since one is a size and one a colour", () => {
    expect(cn("text-label", "text-muted-foreground")).toBe("text-label text-muted-foreground");
    expect(cn("text-body", "text-link")).toBe("text-body text-link");
  });

  it("treats two type steps as the same kind, so the later one wins", () => {
    expect(cn("text-body", "text-label")).toBe("text-label");
    expect(cn("text-title", "text-caption")).toBe("text-caption");
  });
});
