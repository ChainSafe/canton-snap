# dApp Design Mockups

Minimal Figma-style SVG mockups for the Canton Snap dApp. SVGs are fully editable in Figma/Penpot/Inkscape — just drag the file in.

The dApp's purpose (per [epic #8](https://github.com/ChainSafe/canton-snap/issues/8)): let users connect MetaMask, register a Canton party (custodial or non-custodial), view token balances, and transfer tokens.

## Files

| File | Screen | Route / trigger |
|---|---|---|
| [`01-landing.svg`](./01-landing.svg) | Connect MetaMask | `/` |
| [`02-registration.svg`](./02-registration.svg) | Custodial vs non-custodial choice | `/register` |
| [`03-wallet-menu.svg`](./03-wallet-menu.svg) | Wallet dropdown — address + disconnect | click wallet chip (top right) |
| [`04-custodial-flow.svg`](./04-custodial-flow.svg) | Custodial signing state | `/register` → Use Custodial |
| [`05-noncustodial-flow.svg`](./05-noncustodial-flow.svg) | Non-custodial 4-step progress | `/register` → Use Non-Custodial |
| [`06-success.svg`](./06-success.svg) | Registered — party ID + fingerprint | shared by both flows after completion |
| [`07-network-switcher.svg`](./07-network-switcher.svg) | Network switcher — Mainnet / Devnet / Local | click network pill (top right) |
| [`08-dashboard-profile.svg`](./08-dashboard-profile.svg) | Dashboard → Profile (identity + quick actions) | `/dashboard` (default) |
| [`09-dashboard-balances.svg`](./09-dashboard-balances.svg) | Dashboard → Balances (full token list) | `/dashboard/balances` |
| [`10-dashboard-transfer.svg`](./10-dashboard-transfer.svg) | Dashboard → Transfer (send form) | `/dashboard/transfer` |
| [`11-dashboard-bridge.svg`](./11-dashboard-bridge.svg) | Dashboard → Bridge (cross-chain, placeholder) | `/dashboard/bridge` |
| [`12-transfer-flow-noncustodial.svg`](./12-transfer-flow-noncustodial.svg) | Non-custodial transfer — 4-step progress | Submit on Transfer tab (key_mode=external) |
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
Landing ─► Registration ─► {Custodial | Non-Custodial} ─► Success ─► Dashboard ─► {Send | Bridge}
   │             │                                           │            │
   │             └─ Wallet menu (disconnect / copy addr)     │            └─ Manage Snap
   │                                                          │
   └─ If already connected & registered ──────────────────────┴─► Dashboard
```

**Dashboard layout** — persistent 240px left sidebar with 5 nav items (Profile / Balances / Transfer / Bridge / Activity) plus a snap-status chip pinned to the bottom. Top bar (network pill + wallet chip) stays at the same absolute position across all tabs for consistency.

**Profile tab** — identity card (party ID, fingerprint, key-mode tag) on the left, quick-action buttons (Send → Transfer tab, Bridge → Bridge tab) on the right. Below: a 3-column Connection card (MetaMask, Canton Snap, Middleware).

**Balances tab** — total-value header card + sortable token list with ASSET / BALANCE / VALUE / ACTIONS columns. Per-row "Send →" link jumps straight to the Transfer tab pre-filled.

**Transfer tab** — two-column form: left is the form (token selector, recipient, amount with MAX button, fee hint, submit), right is a live Summary card with `NON-CUSTODIAL` tag and a `SIGNING STEPS` mini-list (MetaMask + Snap). On submit:
- **Non-custodial** (key_mode=`external`): opens the 4-step progress screen (`12-transfer-flow-noncustodial.svg`) — `personal_sign` → `/prepare` → `canton_signHash` in the snap → `/execute`. Matches the `POST /api/v2/transfer/{prepare,execute}` endpoints in canton-middleware.
- **Custodial** (key_mode=`custodial`): no dedicated endpoint — the dApp submits a plain ERC20 `transfer()` via the middleware's EVM JSON-RPC. Single MetaMask popup; reuses the existing wallet sign flow (no dedicated mockup needed).

**Bridge tab** — FROM / TO network cards with a swap-direction button between them, amount + token selector per side, destination address, fee/time summary. CTA is gated ("coming soon") since bridging is a Phase 3 concern.

**Activity tab** — _(no mockup yet)_ full history list, same row pattern as the old in-profile activity section.

**Custodial** — one MetaMask signature → POST `/register`. The middleware generates and holds the Canton key.

**Non-custodial** — four sequential confirmations:
1. `canton_getPublicKey` (snap dialog)
2. `personal_sign(register:<ts>)` (MetaMask)
3. `canton_signTopology` (snap dialog)
4. POST `/register` with all signatures

**Wallet menu** — overlay popover anchored to the wallet chip; surfaces the full address (with copy) and disconnect. Network lives on its own pill so it isn't duplicated here.

**Network switcher** — overlay popover anchored to the network pill; lists Canton Mainnet / Devnet / Local with a coloured indicator per network (green / amber / blue). Always visible in the header so the user knows which network they're on.

**Header pills** (all signed-in screens show two):

```
[● Canton Devnet ▾]  [● 0x742d…4B9e ▾]
  network pill          wallet chip
```
