/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 名片服务端 API 基地址（同域部署留空） */
  readonly VITE_CARD_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
