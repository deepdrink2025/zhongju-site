/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 名片服务端 API 基地址（同域部署留空） */
  readonly VITE_CARD_API_BASE?: string;
  /** 设为 'on' 启用服务端名片模式 */
  readonly VITE_CARD_SERVER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
