# Canton Faucet

Public web faucet for the devnet test tokens (DEMO, PROMPT, USDCX). Anyone can fund a
registered devnet address and try the dapp — no wallet connection or sign-in; the
middleware enforces per-address rate limits.

Design: [canton-snap#96](https://github.com/ChainSafe/canton-snap/issues/96) ·
Backend API: [canton-middleware#350](https://github.com/ChainSafe/canton-middleware/issues/350)

## Development

```bash
# from the monorepo root
npm install
npm run dev:faucet
```

Configuration comes from the monorepo root `.env` (same variables as the dapp):

| Variable              | Description                              | Default                 |
| --------------------- | ---------------------------------------- | ----------------------- |
| `VITE_MIDDLEWARE_URL` | Base URL of the Canton middleware        | `http://localhost:8081` |
| `VITE_NETWORK`        | Network id (`devnet`, `local`, …)        | `local`                 |

The middleware must expose the faucet endpoints under `/api/v2/faucet/*`
(tokens, drip, status, drips/recent).

## Docker

Mirrors the dapp image: static build served by unprivileged nginx, with
`VITE_*` values injected at container startup.

```bash
docker build -f packages/faucet/Dockerfile -t canton-faucet .
docker run -p 8080:8080 \
  -e VITE_MIDDLEWARE_URL=https://middleware-api-dev1.01.chainsafe.dev \
  -e VITE_NETWORK=devnet \
  canton-faucet
```
