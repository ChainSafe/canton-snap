# Changelog

## [1.4.0](https://github.com/ChainSafe/canton-snap/compare/dapp-v1.3.0...dapp-v1.4.0) (2026-07-03)


### Features

* **dapp:** claim back / cancel offered transfers ([#90](https://github.com/ChainSafe/canton-snap/issues/90)) ([ce019b2](https://github.com/ChainSafe/canton-snap/commit/ce019b2cec638ed418421f8f1084f8531d8ca2c8))
* **dapp:** Offers tab listing outgoing offered transfers ([#85](https://github.com/ChainSafe/canton-snap/issues/85)) ([c272ac0](https://github.com/ChainSafe/canton-snap/commit/c272ac0a12a2d13cddb4f19a24e0ae1f95a0ae85))
* **dapp:** rebuild Activity on the transfer history API ([#87](https://github.com/ChainSafe/canton-snap/issues/87)) ([5439659](https://github.com/ChainSafe/canton-snap/commit/5439659d331d3ea9f854d92cd59117f35ff31680))
* **dapp:** transfer by Canton party id with offer expiry ([#84](https://github.com/ChainSafe/canton-snap/issues/84)) ([ef53bb6](https://github.com/ChainSafe/canton-snap/commit/ef53bb6ba7fe0f79d44b0ff16d76daac6352d5fb))

## [1.3.0](https://github.com/ChainSafe/canton-snap/compare/dapp-v1.2.0...dapp-v1.3.0) (2026-06-05)


### Features

* **dapp:** one-click "Add tokens to MetaMask" after registration + balances banner ([#74](https://github.com/ChainSafe/canton-snap/issues/74)) ([d6700cc](https://github.com/ChainSafe/canton-snap/commit/d6700ccf005e3978c735e259cbb93d0c639badbe))
* **dapp:** use ChainSafe logo as app logo and favicon ([#77](https://github.com/ChainSafe/canton-snap/issues/77)) ([0ddc8f7](https://github.com/ChainSafe/canton-snap/commit/0ddc8f705a6625d1214e8aff5e02800fb29e20de))


### Bug Fixes

* **dapp:** activity timestamps in local time, not UTC ([#71](https://github.com/ChainSafe/canton-snap/issues/71)) ([2ad94cb](https://github.com/ChainSafe/canton-snap/commit/2ad94cb9623d10be3734c164ad8edf5e3174cdbc))
* **dapp:** pre-select the clicked token on Transfer ([#72](https://github.com/ChainSafe/canton-snap/issues/72)) ([b76a02a](https://github.com/ChainSafe/canton-snap/commit/b76a02a9568a2fb04e3b540bf4f5a907966e87e6))
* **dapp:** rename product to EVM Middleware and refine landing copy ([#70](https://github.com/ChainSafe/canton-snap/issues/70)) ([39f758c](https://github.com/ChainSafe/canton-snap/commit/39f758ca41259716355e0e6a437b5dd0af42b28e)), closes [#69](https://github.com/ChainSafe/canton-snap/issues/69)
* **dapp:** responsive layout for mobile viewports ([#73](https://github.com/ChainSafe/canton-snap/issues/73)) ([4945944](https://github.com/ChainSafe/canton-snap/commit/49459445bd9d7378ed870d52ef9a31d71d44aa78))

## [1.2.0](https://github.com/ChainSafe/canton-snap/compare/dapp-v1.1.0...dapp-v1.2.0) (2026-06-01)


### Features

* **dapp:** handle async eth_sendRawTransaction + tx status in Activity ([#63](https://github.com/ChainSafe/canton-snap/issues/63)) ([f812f38](https://github.com/ChainSafe/canton-snap/commit/f812f38b284209a6228598ae50e9292255f9979b))


### Bug Fixes

* **ci:** fix workflow_dispatch tag computation ([#61](https://github.com/ChainSafe/canton-snap/issues/61)) ([bd16650](https://github.com/ChainSafe/canton-snap/commit/bd166508d0c771114373f0042df6b195f5e2530f))

## [1.1.0](https://github.com/ChainSafe/canton-snap/compare/dapp-v1.0.0...dapp-v1.1.0) (2026-05-20)


### Features

* **dapp:** add Dockerfile, nginx config, and CI pipeline for Kubernetes deployment ([#57](https://github.com/ChainSafe/canton-snap/issues/57)) ([9a16f6e](https://github.com/ChainSafe/canton-snap/commit/9a16f6ea3d0fde135bacb2b86ed557b6ae64e3fa))

## [1.0.0](https://github.com/ChainSafe/canton-snap/compare/dapp-v0.1.0...dapp-v1.0.0) (2026-05-19)


### ⚠ BREAKING CHANGES

* prepared-transaction envelope, origin gating, audit fixes ([#52](https://github.com/ChainSafe/canton-snap/issues/52))

### Features

* **dapp:** custodial-only readiness + dApp release-please ([#55](https://github.com/ChainSafe/canton-snap/issues/55)) ([b7ab0f1](https://github.com/ChainSafe/canton-snap/commit/b7ab0f1a010a74a1bc9c34e07b41cdba1c726eaa))
* **dapp:** toggle between published and local snap via VITE_SNAP_ID ([#51](https://github.com/ChainSafe/canton-snap/issues/51)) ([f213088](https://github.com/ChainSafe/canton-snap/commit/f213088cfa78b7eab600194abbffa2a9ce7936bc))
* prepared-transaction envelope, origin gating, audit fixes ([#52](https://github.com/ChainSafe/canton-snap/issues/52)) ([a839483](https://github.com/ChainSafe/canton-snap/commit/a8394833304a13db0b28559fbfd560c1c770146e))
