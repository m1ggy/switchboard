/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRPC_URL: string; // add other variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
