/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_REMOTE_STORAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
