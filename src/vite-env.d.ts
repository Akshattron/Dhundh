/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_FORCE_LOCAL?: "1";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
