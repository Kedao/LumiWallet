/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MONADSCAN_API_KEY?: string
  readonly VITE_AGENT_SERVER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
