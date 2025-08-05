/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRPC_URL: string;
  readonly VITE_WEBSOCKET_URL: string;
  readonly VITE_FIREBASE_CONFIG: string;
  readonly VITE_JITSI_DOMAIN: string;
  readonly VITE_JITSI_MUC: string;
  readonly VITE_JITSI_SERVICE_URL: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
