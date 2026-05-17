// 鍵名比對使用 lowercase，所以列舉時也用全小寫
// 包含 camelCase 去底線後的小寫形式（accessToken → accesstoken）與 snake_case 兩種寫法
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash', // 防止 Member entity 的 bcrypt hash 進入 log
  'token',
  'accesstoken',
  'refreshtoken',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'private_key',
  'api_key',
  'apikey',
  'bearer',
]);

const SENSITIVE_QUERY_PARAMS = new Set([
  'email',
  'phone',
  'name',
  'token',
  'key',
]);

export const sanitize = (obj: unknown): string => {
  try {
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'string' && value.startsWith('data:image')) {
        return '[BASE64_IMAGE_REMOVED]';
      }
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        return '[REDACTED]';
      }
      if (key === 'file' || key === 'files') {
        return '[FILE_DATA_REMOVED]';
      }
      return value;
    });
  } catch {
    return '[Unserializable data]';
  }
};

/**
 * 遮蔽 URL query string 中的 PII 欄位值（如 email、phone）。
 * 範例：`/members?email=user@example.com` → `/members?email=[REDACTED]`
 */
export const sanitizeUrl = (url: string): string => {
  try {
    const [path, query] = url.split('?');
    if (!query) return url;
    const sanitized = query
      .split('&')
      .map((part) => {
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1) return part;
        const key = part.slice(0, eqIdx);
        if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
          return `${key}=[REDACTED]`;
        }
        return part;
      })
      .join('&');
    return `${path}?${sanitized}`;
  } catch {
    return url;
  }
};
