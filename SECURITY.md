# Security Policy

## Supported Versions

| Version | Status |
|---------|--------|
| `0.2.x` | Supported |
| `< 0.2` | Unsupported |

## Reporting a Vulnerability

Report security issues privately. Do **not** open public GitHub issues for vulnerabilities.

Preferred channels:

1. [GitHub Security Advisories](https://github.com/ChainSafe/canton-snap/security/advisories/new) on this repository.
2. Email **security@chainsafe.io**.

We aim to acknowledge reports within two business days and provide a remediation plan within seven.

## Scope

In scope:

- Private-key extraction, leakage, or silent re-use.
- Forgery of signatures over a digest the user did not approve.
- Bypass of the confirmation dialog or of origin display.
- Persistent state (`snap_manageState`) tamper, cross-origin allowlist confusion, or unbounded growth.
- Cross-dApp identity correlation without consent.
- Supply-chain compromise of the published npm tarball.

Out of scope (handled by MetaMask or the underlying browser, not this snap):

- MetaMask runtime sandbox escape.
- Browser-level XSS or extension-store compromise.
- Issues in third-party dependencies for which no patched version exists.

## Disclosure Process

Coordinated disclosure. We will work with the reporter on a timeline and credit reporters in the release notes unless they prefer to remain anonymous.
