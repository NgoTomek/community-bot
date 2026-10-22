/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_REPO_URL?: string;
  /** Base URL of the organiser phone app; approval links are `${VITE_PHONE_BASE_URL}/r/<token>`. */
  readonly VITE_PHONE_BASE_URL?: string;
  readonly VITE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
