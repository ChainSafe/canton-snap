# dApp Design Mockups

Minimal Figma-style SVG mockups for the Canton Snap dApp. SVGs are fully editable in Figma/Penpot/Inkscape — just drag the file in.

The dApp's purpose (per [epic #8](https://github.com/ChainSafe/canton-snap/issues/8)): let users connect MetaMask, register a Canton party (custodial or non-custodial), view token balances, and transfer tokens.

## Files

| File | Page | Route |
|---|---|---|
| [`01-landing.svg`](./01-landing.svg) | Connect MetaMask | `/` |
| [`02-registration.svg`](./02-registration.svg) | Custodial vs non-custodial choice | `/register` |
| _(next)_ | Dashboard — balances + transfers | `/dashboard` |

## Design principles

- **Minimal.** Wallet-app onboarding, not a marketing site. One job per screen.
- **No mockups-within-mockups.** Transfer signing, balance lists, snap dialogs belong on their own screens — not on the landing page.
- **Custodial and non-custodial are peers.** Non-custodial CTA is filled (since this is the snap's purpose) but custodial is not visually demoted — Phase 1 ships custodial first.

## Design tokens

**Palette**

| Token | Hex |
|---|---|
| `bg-base` | `#0a0b14` |
| `bg-surface` | `#1a1d2e` (gradient to `#12141f`) |
| `bg-hover` | `#232640` |
| `border-subtle` | `#252840` |
| `border-default` | `#353a5a` |
| `text-primary` | `#f1f3f9` |
| `text-secondary` | `#a1a6c4` |
| `text-muted` | `#656a8a` |
| `brand-primary` | `#00d4a4` (gradient to `#00f0b8`) |
| `accent-violet` | `#8b7cff` (custodial icon) |
| `success` | `#34d399` (connection pulse) |

**Type**

- UI: Inter (variable)
- Mono: JetBrains Mono (addresses, hashes)
- Scale: 44/700 (page title), 20/700 (card title), 15/600 (CTA), 13/400 (body), 12/600/tracking-2.5 (eyebrow)

**Shape**

- Radii: 8 (chip), 10 (button), 12 (primary CTA), 16 (card)
- Card border: 1px `border-subtle`
- Canvas: 1440 × 900, 96px horizontal gutters

## Flow

```
Landing ─► Registration ─► Dashboard
   │             │
   │             ├─► Custodial:     POST /register (EIP-191)
   │             └─► Non-Custodial: snap_getEntropy → prepare-topology → sign-topology → /register
   │
   └─ If already connected & registered → skip to Dashboard
```
