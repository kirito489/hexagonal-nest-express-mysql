import { createApiClient, createApiQueryHooks } from '@app/api-client'

import { tokenStorage } from '@/lib/storage'

// 全 app 共用一個 API client：baseUrl 走 Vite proxy 的 /api，每次請求即時讀 token
export const apiClient = createApiClient('/api', () => tokenStorage.get())

// 401 全域處理：清掉 token 並導向登入頁（避免從 /login 自己跳到 /login 形成迴圈）
apiClient.use({
  onResponse({ response }) {
    if (response.status === 401) {
      tokenStorage.clear()
      if (window.location.pathname !== '/login') {
        window.location.replace('/login')
      }
    }
    return response
  },
})

export const { useApiQuery, useApiMutation } = createApiQueryHooks(apiClient)
