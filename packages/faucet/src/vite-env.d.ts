// SPDX-License-Identifier: Apache-2.0

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NETWORK?: string;
  readonly VITE_MIDDLEWARE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
