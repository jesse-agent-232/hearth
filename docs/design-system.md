# Holm Design System v1

A small visual vocabulary for Holm, built on Tailwind v4 tokens. Every UI surface in the app should compose from this vocabulary instead of hand-rolling pixel values.

The source of truth lives in [`src/app.css`](../src/app.css) inside the `@theme { ... }` block. Tailwind generates utility classes from those tokens automatically; this doc explains what each token means and when to reach for it.

---

## Cheat sheet

The 12 utilities you'll use most. Pin this section if nothing else.

| Goal                                | Use this                                  |
| ----------------------------------- | ----------------------------------------- |
| Hero / modal / command palette      | `surface-3 rounded-xl bloom-focus`        |
| Sticky header / dropdown / popover  | `surface-2 rounded-xl`                    |
| Card / integration tile / inline tip| `surface-1 rounded-lg`                    |
| Pill / chip / status badge          | `surface-0 rounded-pill text-caption`     |
| Input field                         | `bg-surface-input rounded-md bloom-focus` |
| Body text                           | `text-body text-content`                  |
| Label / button text                 | `text-label text-content-muted`           |
| Caption / helper text               | `text-caption text-content-dim`           |
| Eyebrow / uppercase mini-label      | `text-micro uppercase tracking-widest`    |
| Standard interaction transition     | `transition-colors duration-200`          |
| Modal entrance                      | `animate-fade-in-up`                      |
| Dimmed backdrop overlay             | `modal-veil` (see Glass)                  |

---

## Surfaces — the elevation ladder

The headline change in v1: every surface in the app picks a **depth level** instead of inventing its own bg + border + blur + shadow recipe. Four levels:

| Class       | Level | Use for                                              |
| ----------- | ----- | ---------------------------------------------------- |
| `surface-0` | flat  | Recent chips, app tiles, status pills, list rows     |
| `surface-1` | quiet | Cards, integration cards, inline tips, settings rows |
| `surface-2` | lift  | Sticky header, dropdowns, popovers, toasts           |
| `surface-3` | hero  | Hero search palette, modals, command palette         |

Each level is a **bundle** of bg + border + blur + shadow that always travel together. The composite class applies all four; you don't need (and shouldn't write) the individual utilities.

```html
<!-- Right -->
<div class="surface-3 rounded-xl p-6">…modal…</div>

<!-- Wrong — re-invents the recipe -->
<div class="bg-zinc-900/55 border border-white/10 backdrop-blur-xl shadow-xl rounded-xl p-6">…</div>
```

### When to reach down a level

If a surface looks too heavy at its current level, drop to the next quieter one — don't soften by tweaking opacity or blur. Conversely, if a focal element fades into the wallpaper, push it up a level rather than adding a custom shadow.

### Atomic tokens (escape hatch)

For the rare case where you need to override one axis (e.g., a surface-2 popover with no shadow), the underlying Tailwind utilities are also generated:

```
bg-surface-{1,2,3}            border-border-{0,1,2,3}
backdrop-blur-{soft,card,glass,hero}
shadow-{flat,rest,lift,bloom}
```

Use these sparingly. If you find yourself stacking them to recreate a level, you should be using the composite class instead.

---

## Border radii

Five named steps. **Don't use raw pixel radii** (`rounded-[10px]`).

| Token         | Value | Use for                                       |
| ------------- | ----- | --------------------------------------------- |
| `rounded-sm`  | 6px   | Tiny chips, kbd hints                         |
| `rounded-md`  | 10px  | Inputs, buttons, form rows                    |
| `rounded-lg`  | 14px  | Cards, list items, integration cards          |
| `rounded-xl`  | 20px  | Modals, hero search, dropdowns                |
| `rounded-pill`| ∞     | Recent chips, toggles, status dots |

Inputs and buttons should always be `rounded-md`. Mixing radii on adjacent controls makes the toolbar look glitchy.

---

## Shadows

Four names, used in lockstep with the surface levels:

| Token          | Use for                                                |
| -------------- | ------------------------------------------------------ |
| `shadow-flat`  | Explicit "no shadow" — readable intent                 |
| `shadow-rest`  | Quiet glass (built into `surface-1`)                   |
| `shadow-lift`  | Lifted/hero (built into `surface-2`/`surface-3`)       |
| `shadow-bloom` | Focus / active state on interactive surfaces           |

Most components inherit a shadow from their `surface-*` class — you rarely apply `shadow-*` directly. The exception is `shadow-bloom`, which is applied via the `bloom-focus` utility on focus-within (see Focus, below).

The legacy `shadow-theme` token is kept as an alias to `shadow-lift` for one migration cycle, then removed.

---

## Type scale

Six named sizes, each paired with a sensible line-height. **Don't use raw rem values** (`text-[0.78rem]`). The Tailwind defaults `text-xs/sm/base` still resolve, but prefer the named scale.

| Token          | Size      | Role                                             |
| -------------- | --------- | ------------------------------------------------ |
| `text-micro`   | 0.6rem    | Eyebrows, all-caps labels, status badges         |
| `text-caption` | 0.7rem    | Helper text, captions, mono hints                |
| `text-label`   | 0.78rem   | Form labels, tab labels, button text             |
| `text-body`    | 0.85rem   | Default body, search input, list item content    |
| `text-title`   | 1.15rem   | Modal titles, slide titles                       |
| `text-display` | 1.5rem    | Hero clock, large headings                       |

All copy is mono (`var(--font-mono)`). Don't introduce sans-serif unless you have a specific reading-density problem to solve.

### Text colors

Three tiers, theme-aware:

| Token                | Use for                                                  |
| -------------------- | -------------------------------------------------------- |
| `text-content`       | Primary text, headings, hero copy                        |
| `text-content-muted` | Secondary text, labels, button copy                      |
| `text-content-dim`   | Placeholder text, captions, inactive icons               |

---

## Motion

Three durations + one easing. Everything that moves should use one of these.

| Token             | ms  | Use for                                       |
| ----------------- | --- | --------------------------------------------- |
| `duration-150`    | 150 | Hover color shifts, tooltip fades             |
| `duration-200`    | 200 | Standard state changes, focus transitions     |
| `duration-300`    | 300 | Modal enter/exit, drawer slides               |
| `ease-standard`   | —   | Apple-ish spring: `cubic-bezier(0.2,0.8,0.2,1)` |

`duration-150/200/300` are Tailwind defaults but the canonical Holm durations. Don't introduce new ones (no `duration-180`, no `duration-700`).

```html
<button class="transition-colors duration-200 ease-standard hover:bg-surface-card-hover">
```

For longer animations (wallpaper fades), use the existing `animate-fade-in` / `animate-fade-in-up` keyframes already in the theme.

---

## Backdrop blur

Four values, paired with the surface levels. Don't use raw `backdrop-blur-[Npx]`.

| Token                 | Value | Used by               |
| --------------------- | ----- | --------------------- |
| `backdrop-blur-soft`  | 6px   | Page-level overlays   |
| `backdrop-blur-card`  | 12px  | `surface-1`           |
| `backdrop-blur-glass` | 16px  | `surface-2`           |
| `backdrop-blur-hero`  | 24px  | `surface-3`           |

If you're using a `surface-*` composite class you don't need to apply blur separately — it's built in.

---

## Focus

Holm had no consistent focus pattern before v1 (only 2 `focus:ring-*` instances site-wide). Now there's one:

```html
<input class="bg-surface-input rounded-md px-3 py-2 bloom-focus" />
<form class="surface-3 rounded-xl bloom-focus">…</form>
```

`bloom-focus` swaps `shadow-lift` for `shadow-bloom` and tightens the border on `:focus-within`. It works on any element — input, form, card, button — and provides the same depth cue everywhere.

For active state without focus (e.g., a selected tab), apply the `is-bloomed` class manually.

**Accessibility:** `bloom-focus` is the minimum viable focus indicator for keyboard navigation. Don't strip it without a replacement.

---

## Recipe gallery

Copy-paste these for common components.

### Input

```html
<input
  class="bg-surface-input border border-border-input rounded-md px-3 py-2 text-body text-content
         placeholder:text-content-dim outline-none bloom-focus"
  placeholder="Search…"
/>
```

### Button — primary

```html
<button class="bg-surface-card-strong rounded-md px-4 py-2 text-label text-content
               transition-colors duration-200 hover:bg-surface-card-hover bloom-focus">
  Save
</button>
```

### Button — ghost

```html
<button class="rounded-md px-3 py-2 text-label text-content-muted
               transition-colors duration-200 hover:text-content hover:bg-surface-card-hover">
  Cancel
</button>
```

### Card

```html
<div class="surface-1 rounded-lg p-4">
  <h3 class="text-label text-content mb-1">Card title</h3>
  <p class="text-caption text-content-muted">Card body copy.</p>
</div>
```

### Modal

```html
<div class="fixed inset-0 modal-veil z-[100] flex items-center justify-center p-4">
  <div class="glass-card rounded-xl w-full max-w-[480px] p-8 animate-fade-in-up">
    <h2 class="text-title text-content mb-4">Modal title</h2>
    …
  </div>
</div>
```

### Dropdown / popover

```html
<div class="surface-2 rounded-xl mt-1 max-h-[60vh] overflow-y-auto">
  <button class="w-full text-left px-4 py-2 text-body text-content
                 transition-colors duration-200 hover:bg-surface-card-hover">
    Option
  </button>
</div>
```

### Pill / chip

```html
<a class="surface-0 rounded-pill px-3 py-1 text-caption text-content-muted
          transition-colors duration-200 hover:text-content">
  Recent app
</a>
```

### Toast

```html
<div class="surface-2 rounded-lg px-4 py-3 text-label text-content shadow-lift animate-fade-in-up">
  Saved.
</div>
```

### Hero search palette

```html
<form class="surface-3 rounded-xl px-5 h-[56px] flex items-center bloom-focus">
  <svg class="w-5 h-5 text-content-dim shrink-0">…</svg>
  <input class="flex-1 bg-transparent border-none px-3 outline-none text-body text-content
                placeholder:text-content-dim" />
  <kbd class="surface-0 rounded-sm px-1.5 py-0.5 text-micro text-content-muted">/</kbd>
</form>
```

---

## Glass

Modals, menus and the search palette share one frosted-glass recipe, taken
from the login card. The tokens live in `src/app.css` (`--glass-*`).

| Class                     | Use for                                   |
| ------------------------- | ----------------------------------------- |
| `glass-card`              | Modals and first-run cards: clear glass   |
| `glass-card menu-surface` | Menus and popovers: same blur, darker tint so text stays readable over white tiles |
| `modal-veil`              | The full-screen wrapper behind a modal    |
| `segmented` / `segmented-item` | Two-to-four-way choices (Theme, Icon style) |
| `glass-check`             | Checkboxes                                |

Three rules the browser enforces:

- **Never put `backdrop-filter` on a modal's wrapper.** It becomes the
  backdrop root and the card inside blurs nothing. `modal-veil` paints its dim
  and blur on a `::before` layer for that reason.
- **Don't fade a modal's wrapper with opacity** (`animate-fade-in`). Opacity
  below 1 also makes it a backdrop root, so the blur appears only when the
  fade ends and the modal flashes. `modal-veil` fades its own layer instead;
  animate the card, not the wrapper.
- **Write only the unprefixed `backdrop-filter`.** The build adds the
  `-webkit-` copy; writing both by hand makes the minifier keep only the
  prefixed one, which Chrome ignores.

---

## Don'ts

- **No raw pixel sizes**: `text-[0.8rem]`, `rounded-[10px]`, `backdrop-blur-[12px]`. Use the named scale.
- **No raw `rgba(...)` in component styles.** All color values come from CSS variables defined in `:root` / `.theme-light`.
- **No inline `box-shadow` rules.** Use `shadow-*` utilities or a `surface-*` composite class.
- **No new `backdrop-filter` recipes.** Stick to `surface-{1,2,3}` or `backdrop-blur-{soft,card,glass,hero}`.
- **No role-named one-off classes.** If your component has a `.my-component-card` selector with custom bg + border + shadow, you're re-inventing a surface level. Use one.
- **No `outline: none` without a `bloom-focus` replacement.** Keyboard users need a visible focus indicator.
- **No new motion durations.** 150 / 200 / 300 ms are the only sanctioned values.

---

## Migration map

For the gradual refactor of existing components, here's the legacy → v1 mapping:

| Legacy class / pattern                      | Replace with                              |
| ------------------------------------------- | ----------------------------------------- |
| `bg-surface-card border border-border-card` | `surface-1`                               |
| `bg-surface-modal-card backdrop-blur-[80px\|120px] border border-border-modal-card` | `surface-3` |
| `bg-surface-modal backdrop-blur-xl border border-border-card` (dropdowns) | `surface-2` |
| `.glass-card`                               | `surface-1` (or `surface-2` if it sits over content) |
| `bg-surface-card/30 backdrop-blur-sm` (inline tip) | `surface-0` or `surface-1`         |
| `bg-surface-overlay backdrop-blur-[6px]` (modal scrim) | `modal-veil` |
| `shadow-theme`                              | `shadow-lift` (or inherit from `surface-*`) |
| `rounded-[10px]`                            | `rounded-md`                              |
| `rounded-2xl` on modals                     | `rounded-xl`                              |
| `text-[0.8rem]`                             | `text-body`                               |
| `text-[0.7rem]`                             | `text-caption`                            |
| `text-[0.75rem]` / `text-[0.78rem]`         | `text-label`                              |
| `text-[0.6rem]` / `text-[0.55rem]` / `text-[0.65rem]` | `text-micro`                    |
| `text-[1.2rem]`                             | `text-title`                              |
| `focus:border-border-pill` (inputs)         | `bloom-focus`                             |

Migration runs as a sequence of small PRs, one cluster of components per PR (modals → dropdowns → cards → pills → inputs). Every PR ships before/after screenshots from `.claude-playwright-capture.mjs`.
