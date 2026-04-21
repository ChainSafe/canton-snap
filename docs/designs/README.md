# dApp Design Mockups

Figma-style SVG mockups for the Canton Snap dApp redesign. These are **design specs only** — no code has been written yet.

Open each file in a browser or any SVG viewer.

## Files

| File | Page | Canvas |
|---|---|---|
| [`01-landing.svg`](./01-landing.svg) | Landing — connect MetaMask, install snap | 1440 × 900 |
| [`02-registration.svg`](./02-registration.svg) | Registration — custodial vs non-custodial choice | 1440 × 900 |

## Design system

**Palette**

| Token | Hex | Usage |
|---|---|---|
| `bg-base` | `#0a0b14` | Page background |
| `bg-elevated` | `#12141f` | Cards lower layer |
| `bg-surface` | `#1a1d2e` | Cards upper layer |
| `bg-hover` | `#232640` | Hover, secondary buttons |
| `border-subtle` | `#252840` | Card borders |
| `border-default` | `#353a5a` | Input borders |
| `text-primary` | `#f1f3f9` | Headings, body |
| `text-secondary` | `#a1a6c4` | Descriptions |
| `text-muted` | `#656a8a` | Eyebrows, captions |
| `brand-primary` | `#00d4a4` | Canton teal — primary CTA |
| `brand-hover` | `#00f0b8` | CTA hover highlight |
| `accent-coral` | `#ff6b6b` | Warnings, errors |
| `accent-violet` | `#8b7cff` | Custodial accent |
| `accent-amber` | `#ffb84d` | Caution tags |

**Type scale**

| Size | Use |
|---|---|
| 64 / 800 / tracking -1.5 | Hero headline |
| 44 / 800 / tracking -1.2 | Page title |
| 22 / 700 | Card title |
| 18 / 700 | Section title |
| 17 / 400 | Hero body |
| 15 / 700 | CTA label |
| 13 / 500 | Body / description |
| 11 / 600 / tracking 1 | Eyebrow / tag |

**Type families**

- UI: Inter (variable)
- Mono: JetBrains Mono (hashes, addresses)

**Radii**: 6 / 10 / 14 / 20 / 26 (pill)

**Grid**: 1440 canvas, 96px horizontal margins, 12-col layout

## Flow

```
Landing ─────► Registration ─────► Dashboard (next design)
  │                 │
  │                 ├─► Custodial path (1 click)
  │                 └─► Non-Custodial path (4 steps)
  │
  └─ If already registered → skip straight to Dashboard
```

## Inspiration

- Phantom wallet (card composition, dark theme rhythm)
- Rainbow wallet (button shapes, glow CTAs)
- Canton documentation (typography, teal accent)
