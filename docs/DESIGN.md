# Design direction — Strauss Car Advisor

Status: direction approved by the user (21/10). Implement in the UX/design phase, after features are done.

## Goal
Use the Strauss logo colors, but the result must feel **clean, mature, technological and innovative** — never childish or "rainbow".

Principle: **neutral base, brand colors as precise accents.** The full logo palette spread everywhere looks childish; used sparingly it looks like a brand.

## Colors
**Do not guess hex values.** Sample the exact colors from the Strauss logo file in the repo (prefer SVG; PNG is acceptable). Define them once as design tokens (CSS variables) and use only the tokens.

| Role | Color | Use |
|---|---|---|
| Base | White panels on a very light blue-gray page, near-black text | Most of the screen. This is what makes it feel mature. |
| Primary | Logo blue (`--brand-blue-ink`) | Buttons (incl. the primary action), send button, accents, the employee's chat bubble tint. (22/10: replaces brand red on the primary button.) |
| Brand red | Strauss red (from the wordmark) | The logo ONLY. Nothing else. |
| Tech accent | Logo blues / cyan | Comparison, charts, links, focus states, selected items. |
| Positive | Logo green | Net goes up, positive difference. |
| Warning | Logo orange | Warnings, "לא זוהה — יש למלא", "לא מופיע בתלוש". **Not red**, so brand red is never read as "error". |
| Petal fan | Full logo palette | The assistant's avatar (the logo petals in a small light-blue circle, never a robot) and the logo in the header. |

## Employee screen layout (22/10)
- Header: assistant avatar, "יועץ הרכב" + subtitle, help, logo. On phones a ☰ button opens "הפרטים שלי" as a drawer.
- Sidebar (lg+): "הפרטים שלי" with the payslip upload. No history, settings or bottom nav.
- Chat: soft bubbles (~16px radius) with avatars; employee on the right in a light-blue tint, assistant on the left, white with a thin border. Rounded input bar: paperclip, field, round blue send button.

Contrast: all text and interactive states must meet WCAG AA.

## Feel
- **Font:** clean Hebrew sans-serif. Heebo or Assistant (Google Fonts).
- **Space:** generous whitespace, calm layout, clear hierarchy.
- **Shapes:** moderately rounded corners (not pill-shaped everywhere), thin borders, very subtle shadows.
- **Numbers:** large, clear figures in the comparison (net per option and the difference from today). Tabular numerals so amounts align.
- **Motion:** minimal and quick (e.g. bubble/tooltip fade). No playful animations.
- RTL throughout, phone width without horizontal scroll.

## Avoid
- Many saturated colors on one screen.
- Colored backgrounds for whole sections.
- Red for errors or negative values.
- Emoji, cartoon icons, playful illustrations.
- Gradients everywhere (the petal element is the only exception).

## Applies to
Employee screen, rep screen (including the "פערי מידע" tab), payslip confirm card, onboarding tour bubbles, summary cards.
