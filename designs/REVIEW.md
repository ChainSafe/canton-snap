# UI Design Review

Author: Sebastian
Scope: review of the 27 mockups in this directory.

## Context

The designs cover a complete dApp flow (landing → registration → dashboard → transfer → bridge → activity) with a coherent design system. The big thing I want to raise isn't a list of nits — it's a **reframing of how custodial vs non-custodial is positioned**. The current mockups describe the cryptographic difference ("who holds your Canton key") but not the *integration* difference, and the integration story is what actually matters to users and to what we can ship first.

After the reframing I've listed the top five priority gaps to tackle before v1.

---

## The reframing

### Today, the cards in `02-registration.svg` say

- **Custodial**: "Server manages your Canton signing key."
- **Non-Custodial**: "MetaMask Snap holds your Canton key."

That's a cryptographic framing. It's technically correct but it's not the user-facing story that differentiates the two paths.

### What the user actually experiences

- **Custodial** = works with **vanilla MetaMask** by adding Canton as a custom EVM RPC. Middleware signs on your behalf; MetaMask sees it as a normal Ethereum-compatible chain. **This is the only path shipping in v1.**
- **Non-custodial** = requires installing the **Canton Snap** in MetaMask Flask. Snap signs Canton transactions locally. **Ships after the snap is ready.**

Put differently: custodial is the "no snap needed" path, non-custodial is the "snap required" path.

### What this changes in the designs

1. **Landing ([01-landing.svg](01-landing.svg))** — "Use Canton like Ethereum" overpromises. Canton isn't Ethereum. A softer, more accurate subtitle: *"Register a Canton party and use it from MetaMask."*
2. **Registration choice ([02-registration.svg](02-registration.svg))** — cards should sell *what the user does*, not *who holds the key*. See proposed copy below. Non-custodial card should be marked **Coming soon** with disabled CTA until the snap ships.
3. **Custodial success ([03-registration-custodial.svg](03-registration-custodial.svg) / [05-registration-done.svg](05-registration-done.svg))** — this is the biggest change. The success screen should **present the MetaMask RPC connection values** (network name, RPC URL, chain ID, currency symbol, explorer URL) with a one-click **"Add to MetaMask"** button using [`wallet_addEthereumChain`](https://eips.ethereum.org/EIPS/eip-3085). Without this, the user has registered but has no way to actually use the result. Party ID and fingerprint become secondary/technical details below the fold.

---

## Proposed copy

### Landing ([01-landing.svg:37-38](01-landing.svg))

Replace the current two-line subtitle with:

> Register a Canton party and use it from MetaMask.
> No new wallet needed.

### Custodial card ([02-registration.svg:69-89](02-registration.svg))

Title: **Custodial** (unchanged)
Subtitle: *Use Canton with vanilla MetaMask.*
Bullets:
- Works with the MetaMask you already have
- We'll give you RPC settings to add Canton as a network
- One-click signup — no extensions required

CTA: **Register (Custodial)** — primary/filled (currently secondary)

### Non-custodial card ([02-registration.svg:112-138](02-registration.svg))

Title: **Non-Custodial** + small **Coming soon** pill
Subtitle: *Canton signing inside MetaMask.*
Bullets:
- Install the Canton Snap in MetaMask Flask
- Private key never leaves MetaMask
- You approve every Canton signature

CTA: **Use Non-Custodial** — disabled, `opacity: 0.5`. Card itself stays visible so users see the roadmap.

### Custodial success screen — revised

Replace most of [05-registration-done.svg](05-registration-done.svg) with an RPC-connection card:

```
┌─ You're registered ──────────────────────────────────┐
│  ✓  Your Canton party is live.                       │
│                                                       │
│  ┌─ Add Canton to MetaMask ──────────────────────┐   │
│  │                                                │   │
│  │  Network name     Canton Devnet                │   │
│  │  RPC URL          https://devnet.rpc.canton…   │   │
│  │  Chain ID         2137                         │   │
│  │  Currency symbol  DEMO                         │   │
│  │  Block explorer   https://explorer.devnet.…    │   │
│  │                                                │   │
│  │  [ Add to MetaMask ]   [ Copy values ]         │   │
│  └────────────────────────────────────────────────┘   │
│                                                       │
│  ▸ Technical details                                  │
│    Canton party:   user_0x742d…::12201a…              │
│    Fingerprint:    1220a7f3c2b1…8e92f5d4              │
└───────────────────────────────────────────────────────┘
```

- **"Add to MetaMask"** triggers `wallet_addEthereumChain` — the one-click path. This is the whole reason the custodial flow is possible with stock MetaMask.
- **"Copy values"** is the fallback for users who want to inspect before adding, or who hit browser quirks.
- **Technical details** is collapsed by default — party ID and fingerprint matter to devs, not to "I just want to send USDCx" users.

---

## Top 5 priority comments

### 1. No error states

27 screens cover happy paths, zero cover failure modes. The React dApp at `packages/dapp/src/App.tsx:99` already handles `409 Already Registered`, but the designs don't show what that looks like.

Screens needed:
- Signature rejected in MetaMask
- Middleware unreachable / 5xx
- Snap install rejected or Flask not installed (non-custodial path only — but still in scope for when it ships)
- Wrong network (user on Ethereum mainnet when custodial flow expects Canton RPC active)
- Already registered (409) — separate success-like state, not an error
- Insufficient balance (transfer / bridge deposit)

For wallet-facing UIs this is where most of the real UX work is. **Biggest gap by far.**

### 2. No loading / pending states

A few screens are async-heavy and need mockups:

- **Signing waits** — "Waiting for MetaMask…" overlay after clicking Continue on [10-transfer-non-custodial-details.svg](10-transfer-non-custodial-details.svg)
- **Bridge settlement** — [16-bridge-non-custodial-deposit-details.svg:192-196](16-bridge-non-custodial-deposit-details.svg) says *"relayer settles in ~15–30s"* — where does the user wait, and what does that screen look like?
- **Canton settlement** — [10-transfer-non-custodial-details.svg:160](10-transfer-non-custodial-details.svg) says *"Settles in ~2–4s"* — needs a spinner/progress state between Sign (step 2) and Done (step 3)

[04-registration-noncustodial.svg:86-89](04-registration-noncustodial.svg) has a nice spinner pattern already — reuse it.

### 3. Registration choice framing ([02-registration.svg](02-registration.svg))

Covered in the reframing section above. Summary:
- Current bullets are feature lists, not decision-criteria
- Replace with one-line tradeoffs per card (see proposed copy)
- Mark non-custodial as **Coming soon** with disabled CTA
- Flip primary emphasis to **Custodial** since it ships first (currently the filled CTA is on the non-custodial card at [02-registration.svg:137](02-registration.svg))

### 4. No mobile designs

All mockups are `1440x900`. MetaMask on mobile is meaningful traffic. Two options:

- **Responsive**: add mobile-width (375×812) mockups for at least the landing, registration choice, and custodial success screens.
- **Desktop-only gate**: design a "Please open this on desktop" block screen for mobile viewports. Cheaper and honest given MetaMask Snap is desktop-only during development anyway.

I'd pick the gate for v1 and revisit when custodial flows stabilize.

### 5. Scope cut for v1

Given custodial ships first and non-custodial comes later, polish should focus on the custodial path only:

**Ship polished:**
[01-landing.svg](01-landing.svg), [02-registration.svg](02-registration.svg) (with non-custodial card disabled), [03-registration-custodial.svg](03-registration-custodial.svg), new success screen with RPC card (replaces parts of [05-registration-done.svg](05-registration-done.svg)), [08-dashboard-profile.svg](08-dashboard-profile.svg), [09-dashboard-balances.svg](09-dashboard-balances.svg), [13-transfer-custodial-details.svg](13-transfer-custodial-details.svg)–[15-transfer-custodial-done.svg](15-transfer-custodial-done.svg), [21-bridge-custodial-deposit-details.svg](21-bridge-custodial-deposit-details.svg)–[25-bridge-custodial-done.svg](25-bridge-custodial-done.svg), [26-activity.svg](26-activity.svg).

**Park until snap ships:**
[04-registration-noncustodial.svg](04-registration-noncustodial.svg), [04a-registration-noncustodial-install-snap.svg](04a-registration-noncustodial-install-snap.svg), [10-transfer-non-custodial-details.svg](10-transfer-non-custodial-details.svg)–[12-transfer-non-custodial-done.svg](12-transfer-non-custodial-done.svg), [16-bridge-non-custodial-deposit-details.svg](16-bridge-non-custodial-deposit-details.svg)–[20-bridge-non-custodial-done.svg](20-bridge-non-custodial-done.svg).

Shipping both flows half-finished is worse than shipping the custodial flow polished.

---

## What's working well

Genuinely good foundations worth preserving as the designs evolve:

- **Typography discipline** — the eyebrow captions (`letter-spacing: 1.2, size: 11, color: #656a8a`) are used consistently for data labels across every dashboard card. Rare to see this level of consistency in a first pass.
- **Non-custodial tag pattern** — the small teal pill in [04a](04a-registration-noncustodial-install-snap.svg), [08-dashboard-profile.svg:125-127](08-dashboard-profile.svg), [10:74-77](10-transfer-non-custodial-details.svg) persistently reminds users which mode they're in. Smart. Equivalent "Custodial" tag would be worth adding on the custodial dashboards.
- **Steps bar** ([10-transfer-non-custodial-details.svg:82-107](10-transfer-non-custodial-details.svg)) — clean and reusable across transfer and bridge flows.
- **Segmented direction toggle** ([16-bridge-non-custodial-deposit-details.svg:83-90](16-bridge-non-custodial-deposit-details.svg)) for EVM ↔ Canton is much better than two separate buttons.
- **Wallet menu** ([06-wallet-menu.svg](06-wallet-menu.svg)) — CONNECTED WALLET / CANTON SNAP / Disconnect is the right three-tier hierarchy.

---

## Summary

1. Reposition the custodial/non-custodial split as an *integration* choice (MetaMask + RPC vs MetaMask + Snap), not a cryptographic one.
2. Redesign the custodial success screen around an "Add Canton to MetaMask" RPC card — this is the action that actually unlocks the user.
3. Before v1: add error states, add loading states, decide mobile strategy, scope-cut to custodial-only polish.

Happy to pair on any of this.
