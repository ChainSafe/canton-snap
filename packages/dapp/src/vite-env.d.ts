/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SNAP_PORT: string;
  readonly VITE_DEFAULT_NETWORK?: string;
  readonly VITE_LOCAL_MIDDLEWARE_URL?: string;
  readonly VITE_LOCAL_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
