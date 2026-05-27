// SPDX-License-Identifier: Apache-2.0

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SNAP_ID?: string;
  readonly VITE_NETWORK?: string;
  readonly VITE_MIDDLEWARE_URL?: string;
  readonly VITE_ENABLE_NON_CUSTODIAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
