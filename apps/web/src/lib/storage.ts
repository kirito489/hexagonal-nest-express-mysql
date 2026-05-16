// localStorage key 與存取 API 集中管理，避免散落各處難以替換
const ACCESS_TOKEN_KEY = 'access_token'

export const tokenStorage = {
  get(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  },
  set(token: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
  },
  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
  },
}
