// SPDX-License-Identifier: Apache-2.0

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SNAP_ID?: string;
  readonly VITE_NETWORK?: string;
  readonly VITE_MIDDLEWARE_URL?: string;
  readonly VITE_ENABLE_NON_CUSTODIAL?: string;
  /** SIWE sign-in domain override; defaults to window.location.host. */
  readonly VITE_SIWE_DOMAIN?: string;
  /** SIWE sign-in URI override; defaults to window.location.origin. */
  readonly VITE_SIWE_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
