# dApp Design Mockups

Minimal Figma-style SVG mockups for the Canton Snap dApp. SVGs are fully editable in Figma/Penpot/Inkscape — just drag the file in.

The dApp's purpose (per [epic #8](https://github.com/ChainSafe/canton-snap/issues/8)): let users connect MetaMask, register a Canton party (custodial or non-custodial), view token balances, and transfer or bridge tokens.

## Files

Files are grouped by flow, with decade-prefixed numbers so they sort into clear sections:

### 01–05 · Onboarding

| File | Screen | Route / trigger |
|---|---|---|
| [`01-landing.svg`](./01-landing.svg) | Landing — connect MetaMask | `/` |
| [`02-registration.svg`](./02-registration.svg) | Choose custodial vs non-custodial | `/register` |
| [`03-registration-custodial.svg`](./03-registration-custodial.svg) | Custodial signing state | after choosing Custodial |
| [`04-registration-noncustodial.svg`](./04-registration-noncustodial.svg) | Non-custodial 4-step progress | after choosing Non-Custodial |
| [`05-registration-done.svg`](./05-registration-done.svg) | Registered — party ID + fingerprint | shared final state |

### 10–11 · Global overlays

| File | Screen | Trigger |
|---|---|---|
| [`10-wallet-menu.svg`](./10-wallet-menu.svg) | Wallet dropdown — address + disconnect | click wallet chip (top right) |
| [`11-network-switcher.svg`](./11-network-switcher.svg) | Network switcher — Mainnet / Devnet / Local | click network pill (top right) |

### 20–21 · Dashboard home

| File | Screen | Route |
|---|---|---|
| [`20-dashboard-profile.svg`](./20-dashboard-profile.svg) | Profile — identity + quick actions | `/dashboard` (default) |
| [`21-dashboard-balances.svg`](./21-dashboard-balances.svg) | Balances — full token list | `/dashboard/balances` |

### 30–32 · Transfer wizard — **non-custodial**

| File | Step |
|---|---|
| [`30-transfer-details.svg`](./30-transfer-details.svg) | 1 · Details (form) |
| [`31-transfer-sign.svg`](./31-transfer-sign.svg) | 2 · Sign (Canton Snap) |
| [`32-transfer-done.svg`](./32-transfer-done.svg) | 3 · Done (receipt) |

### 40–44 · Bridge wizard — **non-custodial**

| File | Direction | Step |
|---|---|---|
| [`40-bridge-deposit-details.svg`](./40-bridge-deposit-details.svg) | EVM → Canton | 1 · Details |
| [`41-bridge-deposit-confirm.svg`](./41-bridge-deposit-confirm.svg) | EVM → Canton | 2 · Confirm |
| [`42-bridge-withdraw-details.svg`](./42-bridge-withdraw-details.svg) | Canton → EVM | 1 · Details |
| [`43-bridge-withdraw-confirm.svg`](./43-bridge-withdraw-confirm.svg) | Canton → EVM | 2 · Confirm |
| [`44-bridge-done.svg`](./44-bridge-done.svg) | _shared_ | 3 · Done (receipt) |

### 50–52 · Transfer wizard — **custodial**

| File | Step |
|---|---|
| [`50-transfer-custodial-details.svg`](./50-transfer-custodial-details.svg) | 1 · Details (form) |
| [`51-transfer-custodial-sign.svg`](./51-transfer-custodial-sign.svg) | 2 · Sign (single MetaMask popup via `/eth` RPC) |
| [`52-transfer-custodial-done.svg`](./52-transfer-custodial-done.svg) | 3 · Done (receipt) |

### 60–64 · Bridge wizard — **custodial**

| File | Direction | Step |
|---|---|---|
| [`60-bridge-custodial-deposit-details.svg`](./60-bridge-custodial-deposit-details.svg) | EVM → Canton | 1 · Details |
| [`61-bridge-custodial-deposit-confirm.svg`](./61-bridge-custodial-deposit-confirm.svg) | EVM → Canton | 2 · Confirm (same as 41 — still 2 EVM sigs) |
| [`62-bridge-custodial-withdraw-details.svg`](./62-bridge-custodial-withdraw-details.svg) | Canton → EVM | 1 · Details |
| [`63-bridge-custodial-withdraw-confirm.svg`](./63-bridge-custodial-withdraw-confirm.svg) | Canton → EVM | 2 · Confirm (single EIP-191 popup, server signs Canton) |
| [`64-bridge-custodial-done.svg`](./64-bridge-custodial-done.svg) | _shared_ | 3 · Done (receipt) |

Custodial and non-custodial screens share the same wizard pattern and are 1:1 with their non-custodial counterparts — the visible differences are the mode tag (violet `CUSTODIAL` vs teal `NON-CUSTODIAL`) and, on the Sign/Confirm steps, what the user actually signs (single MetaMask popup for custodial vs snap-signed DER for non-custodial).

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
Landing ─► Registration ─► {Custodial | Non-Custodial} ─► Done ─► Dashboard ─► {Transfer | Bridge}
   │             │                                          │            │
   │             └─ 10-wallet-menu (disconnect / copy)      │            └─ 11-network-switcher (chain)
   │                                                         │
   └─ If already connected & registered ─────────────────────┴─► Dashboard
```

**Dashboard layout** — persistent 240px left sidebar with 5 nav items (Profile / Balances / Transfer / Bridge / Activity). Top bar (network pill + wallet chip) stays at the same absolute position across all tabs for consistency.

**Profile tab** — identity card (party ID, fingerprint, key-mode tag) on the left, quick-action buttons (Send → Transfer tab, Bridge → Bridge tab) on the right. Below: a 3-column Connection card (MetaMask, Canton Snap, Middleware).

**Balances tab** — sortable token list with ASSET / BALANCE / ACTIONS columns. Per-row "Send →" link jumps straight to the Transfer tab pre-filled.

**Transfer tab** — single-page wizard with a 3-step progress bar (`Details → Sign → Done`) pinned under the title. The `NON-CUSTODIAL` tag sits next to the "Transfer" heading so the mode is clear at a glance.

- **Step 1 — Details** (`30-transfer-details.svg`): centered form (token / recipient / amount + MAX) with an info row noting "You'll sign twice (MetaMask + Snap)" and a single **Continue** CTA.
- **Step 2 — Sign** (`31-transfer-sign.svg`): teal-bordered focus card showing the current action (snap signing with a spinner + hash preview + **Open snap dialog** button). Two small check pills beneath the CTA confirm the automatic background steps ("Authenticated with MetaMask", "Transaction prepared") so users know the two API round-trips (`/prepare`, `/execute`) are handled.
- **Step 3 — Done** (`32-transfer-done.svg`): success card with glowing check, amount/recipient/tx-hash/timestamp receipt, and two CTAs — **Send another** (resets to step 1) and **View in Activity →**.

Maps to the canton-middleware API: `POST /api/v2/transfer/prepare` → `canton_signHash` in the snap → `POST /api/v2/transfer/execute`.

**Custodial transfers** (`50-52`) — the same 3-step wizard, but the Sign step is a single MetaMask popup for an ERC20 `transfer()` call via the middleware's `/eth` JSON-RPC. Middleware co-signs the Canton side invisibly. No snap required.

**Bridge tab** — same 3-step wizard pattern as Transfer (`Details → Confirm → Done`) plus a **direction toggle** pinned under the title.

- **EVM → Canton** (deposit — `40-bridge-deposit-details.svg` → `41-bridge-deposit-confirm.svg`):
  1. FROM = Ethereum Mainnet + source token (USDC)
  2. TO = Canton Devnet + mirrored token (USDCx) — auto-derives recipient from the user's fingerprint
  3. Confirm: two MetaMask signatures (`token.approve` then `bridge.depositToCanton`) + relayer settlement (~15–30s)

- **Canton → EVM** (withdraw — `42-bridge-withdraw-details.svg` → `43-bridge-withdraw-confirm.svg`):
  1. FROM = Canton Devnet + Canton token (USDCx)
  2. TO = Ethereum Mainnet + EVM token (USDC) — destination is the connected EVM address
  3. Confirm: one Canton Snap signature + relayer release on Ethereum (~20–40s)

Both directions land on `44-bridge-done.svg` once settled: glowing check, a route line showing `500 USDC → 500 USDCx` with colour-coded chain dots, the source-chain tx hash, the destination party/address, and the settlement time. Headline flips between "Deposit complete" and "Withdrawal complete" depending on direction.

**Custodial bridge** (`60-64`) — the same screens but mode tag is violet `CUSTODIAL`. Deposit is identical (two MetaMask signatures — approve + deposit — regardless of mode). Withdraw is simpler: `63-bridge-custodial-withdraw-confirm.svg` replaces the snap-signing focus card with a single EIP-191 MetaMask popup; the server operator signs `InitiateWithdrawal` on Canton invisibly, then the relayer releases on Ethereum.

Destination is auto-derived in both directions (the fingerprint links the Canton party and the EVM address 1:1), so the user doesn't type an address — just picks amount + token.

**Activity tab** — _(no mockup yet)_ full history list, same row pattern as the old in-profile activity section.

## Registration flows

**Custodial** — one MetaMask signature → `POST /register`. The middleware generates and holds the Canton key.

**Non-custodial** — four sequential confirmations:
1. `canton_getPublicKey` (snap dialog)
2. `personal_sign(register:<ts>)` (MetaMask)
3. `canton_signTopology` (snap dialog)
4. `POST /register` with all signatures

## Header pills

All signed-in screens show two:

```
[● Canton Devnet ▾]  [● 0x742d…4B9e ▾]
  network pill          wallet chip
```

- Network pill: colour-coded dot per chain (green = mainnet, amber = devnet, blue = local). Opens `11-network-switcher.svg`.
- Wallet chip: green pulse + truncated address. Opens `10-wallet-menu.svg`.
