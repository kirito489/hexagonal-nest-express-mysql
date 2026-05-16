import { tokenStorage } from '@/lib/storage'

/**
 * API 錯誤
 * @property status - HTTP 狀態碼
 * @property code - 後端回傳的錯誤碼（GlobalExceptionFilter 統一格式）
 * @property body - 後端原始回應內容（已 parse 過的 JSON 或文字）
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  readonly body: unknown

  constructor(
    status: number,
    code: string | undefined,
    body: unknown,
    message?: string,
  ) {
    super(message ?? `API ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

type ApiResponse<T> = {
  success: boolean
  data: T
  timestamp: string
}

/**
 * 全域 fetch 包裝：自動注入 Authorization、處理 401 自動登出
 * 後端 TransformInterceptor 統一回應為 { success, data, timestamp }，這裡會解開外殼回傳 data
 */
export const apiFetch = async <T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const token = tokenStorage.get()
  const headers = new Headers(init.headers)
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`/api${path}`, { ...init, headers })

  // 401：token 失效，清除並導向登入頁
  if (res.status === 401) {
    tokenStorage.clear()
    if (window.location.pathname !== '/login') {
      window.location.replace('/login')
    }
  }

  const contentType = res.headers.get('Content-Type') ?? ''
  const body: unknown = contentType.includes('application/json')
    ? await res.json()
    : await res.text()

  if (!res.ok) {
    const errorBody = body as { code?: string; message?: string } | string
    const code = typeof errorBody === 'object' ? errorBody.code : undefined
    const message = typeof errorBody === 'object' ? errorBody.message : undefined
    throw new ApiError(res.status, code, body, message)
  }

  // 後端統一回應結構：剝掉 { success, data, timestamp } 外殼
  if (
    typeof body === 'object' &&
    body !== null &&
    'data' in body &&
    'success' in body
  ) {
    return (body as ApiResponse<T>).data
  }
  return body as T
}
