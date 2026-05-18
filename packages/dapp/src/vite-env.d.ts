/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SNAP_ID?: string;
  readonly VITE_NETWORK?: string;
  readonly VITE_MIDDLEWARE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
