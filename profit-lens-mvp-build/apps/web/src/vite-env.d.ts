/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHOPIFY_API_KEY: string;
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Shopify App Bridge v4 global, injected by the CDN script in index.html. */
interface Window {
  shopify?: {
    idToken(): Promise<string>;
    toast?: {
      show(message: string, opts?: { isError?: boolean; duration?: number }): void;
    };
  };
}
