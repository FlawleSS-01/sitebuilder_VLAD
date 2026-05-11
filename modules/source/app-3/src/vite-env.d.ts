/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AFFILIATE_LINK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
