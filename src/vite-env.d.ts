/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_REMOTE_STORAGE?: string;
  readonly VITE_TIME_OFF_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
