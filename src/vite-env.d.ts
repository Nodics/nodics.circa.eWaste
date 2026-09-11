/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CUSTOMER_CSRF_COOKIE_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
