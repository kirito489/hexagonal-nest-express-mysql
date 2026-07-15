/**
 * 上傳白名單與規則（安全核心）。
 *
 * 副檔名一律由「驗過的 MIME」推導（EXT_BY_MIME），**絕不取 client 原始檔名的副檔名**，
 * 避免 `evil.png.html` 之類的 stored XSS / 內容嗅探。大小上限由 env `MAX_UPLOAD_BYTES` 控制。
 */

/** 允許上傳的資料夾（key 前綴），未列入者一律拒絕 */
export const UPLOAD_FOLDERS = ['avatars', 'attachments'] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

/** 允許的 MIME → 正規副檔名（此表同時作為 MIME 白名單） */
export const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
} as const;

export type AllowedMime = keyof typeof EXT_BY_MIME;

export const isUploadFolder = (v: string): v is UploadFolder =>
  (UPLOAD_FOLDERS as readonly string[]).includes(v);

export const isAllowedMime = (v: string): v is AllowedMime =>
  Object.prototype.hasOwnProperty.call(EXT_BY_MIME, v);

/** 由驗過的 MIME 取正規副檔名（呼叫前須先以 isAllowedMime 確認） */
export const extForMime = (mime: AllowedMime): string => EXT_BY_MIME[mime];
