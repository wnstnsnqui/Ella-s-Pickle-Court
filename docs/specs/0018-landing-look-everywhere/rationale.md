# 0018. Rationale: the landing look on every screen

The decision record behind [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

The product has two faces that were built a fortnight apart. The working screens (the staff board, settings, reports, users, account, the public board at `/schedule`, sign in, the legal pages) were built first on spec 0003's shadcn maia preset: a solid yellow band across the top of every page, yellow buttons, `rounded-lg` boxes with full borders, a bare grid whose tiles all wear a strong 3:1 edge, and arrows with a heading for changing day. The landing page at `/` came later (spec 0013, then 0015 and 0017 for checkout and the receipt) and was built with the `emil-design-eng`, `animate` and `apple-design` skills. It uses the very same tokens but composes them differently, and it is the face Ella and the players now think of as the venue.

So the gap is not in the tokens. `app/globals.css` serves both faces with the same values. The gap is in how components use those tokens: shape, edges, where yellow goes, the header's material, how buttons answer a press, and how the board is framed. A player who taps "Live schedule" lands on a board that reads as a different product, and the staff spend their whole shift in the older face.

There are hard forces on any change. The landing is finished and verified, and the engineer wants it frozen in code and in pixels. It imports shared pieces (`Button`, `Dialog`, `Input`, `Label`, `Checkbox`, `Skeleton`, `Wordmark`, `ConfirmDialog`) and the shared tokens, so a change to a shared default can leak into it without touching a landing file. `AppShell` is shared by staff and public screens alike, so its look cannot change for one and not the other without a fork. The grid carries a keyboard and ARIA contract and a seven row phone promise (spec 0003 AC-7, AC-8) that staff and screen reader users depend on. And staff use these screens tens of times an hour, so the landing's marketing motion (arrival cascades, scroll reveals) would be wrong there even though its materials are right.

Doing nothing leaves the seam in place and lets each new screen pick a side by accident, which is how the two faces drifted apart in the first place.

### What gives the landing its feel (inventory)

| Ingredient | Landing | Working screens before this spec |
| --- | --- | --- |
| Shape | cards `rounded-3xl`, icon chips `rounded-2xl`, links and chips `rounded-full`, checkout card `rounded-4xl` | `rounded-lg`, `rounded-md` |
| Edges | `ring-1` hairline plus `shadow-sm`; one deep tinted shadow on the hero object | `border`, `shadow-lg` |
| Yellow | one big moment (the hero panel); in flow step buttons; main call to action in dark ink | a band on every page, yellow main buttons |
| Header | glass, clear at the top, hairline on scroll | opaque yellow band with a shadow |
| Type | amber uppercase eyebrows, tight headlines, balanced and pretty wrapping, large tabular stats | plain titles |
| Icons | duotone in tinted chips; bold at small sizes | small regular weight icons |
| Board | in a white card on a grey band, 6px gaps, soft edged tiles with icon and word, a plain legend, a sliding segmented day strip | bare grid, 1px gaps, full edged tiles, swatch legend, arrows and a heading |
| Motion | `press` (0.97, 150ms, strong ease out), sliding highlight (250ms, strong ease in out), card scale in from 0.96 with a faster exit, a hero cascade and scroll reveals | shadcn defaults: `transition-all`, a 1px nudge on press |

## Options considered

### Option 1: Fix in place, screen by screen

Restyle each working screen by hand with the landing's class strings, copying what each needs from the landing files, with no shared recipes.

**Pros**

- Fastest first screen; no new abstractions.
- Nothing shared changes, so the landing is safe by construction.

**Cons**

- The look ends up copied into dozens of class strings; the next change to the card or the press means hunting them down, and they will drift exactly as the two faces did.
- Nothing stops a new screen from reaching for the old shapes again.

### Option 2: Shared recipes and components, opt in, landing frozen (chosen)

Name the landing's materials as utilities in the token layer, build a few shared components for structure, restyle `AppShell` and the grid onto them, and add only opt in variants to anything the landing imports. Prove the landing unchanged by file diff and screenshots.

**Pros**

- The look lives once, next to the tokens, usable from server and client files alike.
- The landing renders exactly as before, and the screenshot compare would catch a leak.
- A lint rule and `/design` keep the working screens from sliding back.

**Cons**

- The landing keeps its own copies until someone unfreezes it, so for a while the recipes exist twice.
- More upfront work than Option 1 before the first screen changes.

### Option 3: Change the shared defaults and let everything inherit

Make the `Button`, `Dialog` and friends default to the landing's look, so every screen, the landing included, picks it up.

**Pros**

- The least code: one change per primitive and the whole app follows.
- No duplicated recipes.

**Cons**

- Breaks the frozen landing: checkout's yellow step buttons, its dialog and its inputs would all shift, and a verified page would need verifying again.
- The landing deliberately uses two button languages (ink for marketing, yellow for steps); one default cannot express both.

### Option 4: Extract the landing's components and repoint the landing at them

Move `press.ts`, the day strip, the section heading and the card styles out of `components/landing/` into shared modules, and have both the landing and the working screens import them.

**Pros**

- One copy of everything from day one, with no drift.
- The cleanest end state.

**Cons**

- Edits landing files, which the engineer ruled out.
- The landing's strip is shaped for a picker (no past days, no calendar, a Past tile); generalising it for the boards would change the landing's own component.

## Rationale

The engineer's two firm constraints decide most of this. The landing is frozen in code and in look, which rules out Option 4 outright and Option 3 in practice: checkout already renders shared defaults (yellow `Button`, `Dialog`, `Input`), so redefaulting them would move a verified page. Between the two that survive, Option 1 repeats the very failure that created the seam (looks copied rather than named) and leaves nothing to keep the next screen honest. Option 2 costs a little more up front and accepts a temporary second copy of the landing's recipes, but it puts the look in the one place spec 0003 already says looks belong (the token layer), keeps every landing import on its old defaults, and gives `/design` and a lint rule something concrete to hold.

The working tempo is the second force. The landing spends motion because it is seen once a visit; the board is seen all shift. Following the frequency rule from `emil-design-eng` and `animate`, the working screens take the landing's materials and its small, fast motions (the press, the sliding day highlight, a sheet that moves along one path and leaves faster than it came) and leave its arrival cascade, scroll reveals and fluid type behind. `apple-design` shaped the materials side: the glass header with a scroll edge instead of a permanent divider, the soft overlay that keeps the board readable behind a parallel task, the sheet anchored to its side and leaving the way it came, and solid fallbacks under reduced transparency.

The engineer asked for the staff board to look the same as the landing's board, which brings one real cost: the landing's tiles have soft or no borders, below spec 0003's 3:1 bar for tile edges. That bar was stricter than WCAG asks. Under WCAG 2.2 the boundary of a control only needs 3:1 when it is what identifies the control; here every tile is identified by an icon and a word that clear 3:1 and 4.5:1 against the tile's own fill, and colour is still never the only signal. So the amendment is narrow (tile borders only), and the bars on fields, focus rings and text stay. Keeping the grid's keyboard and ARIA contract untouched, and holding the seven row phone promise, makes sure the softer look costs the people who use the board nothing but the edge.

### Amendments, 2026-10-05

**AC-1: the ink focus look on shared controls.** During the build the engineer found the focus state on fields ugly: the edge turned the deep amber `--ring` and a 3px halo of the same amber at 50 percent sat around it, which reads as a muddy tan on the grey field. Buttons carried the same halo. Three looks were weighed:

- **Crisp amber, no halo.** Keeps one focus colour across the site, matching the tiles and the day strip. Still brown, which was the complaint, only cleaner.
- **The field lifts to white.** The grey field turns white with a soft shadow and an ink edge. The most landing like, but it adds motion to every focus and does nothing for buttons.
- **Ink edge with a soft ink halo (chosen).** Calm and neutral, and it matches the ink main button, so a field you are typing in reads like the landing's own dark action. The edge is `--foreground`, 19:1 on white.

Buttons cannot take the same edge and halo: an ink edge vanishes on the ink button, and a 10 percent halo is far below the 3:1 a focus indicator needs. So buttons, checkboxes, switches, badges and the calendar's focused day take the same ink as a crisp 2px outline with a 2px offset, which shows on every fill. The first build painted that gap white (`ring-offset-background`); the cross check caught that on the grey page it shows as a white fringe inside the ring, so the gap is now an `outline-offset`, which is see through. The cross check also found the contrast list on `/design` had no row naming the new focus colours, so they now have labelled rows of their own rather than riding on the body text pairs that happen to share the colour.

The engineer chose to apply it everywhere, the landing's checkout included, rather than opt in on working screens only. Opting in would have kept the landing frozen but left the brown ring on the one form a player fills in, and the point of this spec is one look. That breaks AC-1's "keeps its defaults" rule for these primitives, so AC-1 now names the exception precisely rather than letting the rule erode quietly.

The toaster fix rides with it. `theme="system"` let sonner follow a device in dark mode and paint its own near white description on our white toast (about 1.2:1). The app is light only, so pinning `light` and colouring the description from `--muted-foreground` (5.4:1) is a bug fix on every page, the landing's toasts included.

The landing screenshot compare also changed shape. Masking hides a box's content but not its height, and the booking card is as tall as the day's opening hours, so a baseline taken on a long day failed on a short one. The masked parts are now held at a fixed height. The baseline was retaken after the focus change; before retaking, the diff showed every unmasked pixel unchanged apart from that height shift.

**AC-9: the live pill stays off both boards.** The engineer removed the live indicator from both boards on 2026-09-16 (commit `d8c725b`), before this spec was written, and the spec reintroduced it without that history. Asked during the build, the engineer kept it off. The reason was not recorded; it is the engineer's product call. The cost is real and named in Consequences: a dropped channel is now silent on screen, with the slow poll (spec 0006, AC-6) as the only safety net. The pill keeps its landing restyle and its `/design` preview, so taking it back is a small change to AC-5 and AC-9, not new work.
