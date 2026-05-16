import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'
import type { MaybeOptionalInit } from 'openapi-fetch'
import type { PathsWithMethod } from 'openapi-typescript-helpers'

import type { ApiClient } from './client'
import type { paths } from './schema'

type GetPath = PathsWithMethod<paths, 'get'>

type WriteMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type LowerMethod<M extends WriteMethod> = Lowercase<M>

type GetResponse<P extends GetPath> = paths[P] extends { get: infer Op }
  ? ExtractResponse<Op>
  : never

type WriteResponse<
  M extends WriteMethod,
  P extends PathsWithMethod<paths, LowerMethod<M>>,
> = paths[P] extends Record<LowerMethod<M>, infer Op> ? ExtractResponse<Op> : never

// 後端 TransformInterceptor 統一回應外殼為 { success, data, timestamp }，
// 萃取 200/201 的 application/json 並進一步剝出 data，hooks 直接回傳 caller 關心的內容
type Unwrap<J> = J extends { data: infer D } ? D : J

type ExtractResponse<Op> = Op extends {
  responses: infer R
}
  ? R extends { 200: { content: { 'application/json': infer J } } }
    ? Unwrap<J>
    : R extends { 201: { content: { 'application/json': infer J } } }
      ? Unwrap<J>
      : void
  : never

type GetInit<P extends GetPath> = MaybeOptionalInit<paths[P], 'get'>

type WriteInit<
  M extends WriteMethod,
  P extends PathsWithMethod<paths, LowerMethod<M>>,
> = MaybeOptionalInit<paths[P], LowerMethod<M>>

// 內部用：把 openapi-fetch 的嚴格 method 簽章替換成寬鬆版本，避開泛型推導打架
type LooseFn = (
  url: string,
  init?: unknown,
) => Promise<{ data?: unknown; error?: unknown; response: Response }>

/**
 * 從 ApiClient 生成 TanStack Query hooks。
 * 集中綁定 client 後，前端可直接呼叫 useApiQuery / useApiMutation，不需每次傳 client。
 */
export const createApiQueryHooks = (client: ApiClient) => {
  const useApiQuery = <P extends GetPath, TData = GetResponse<P>>(
    method: 'GET',
    path: P,
    init?: GetInit<P>,
    options?: Omit<
      UseQueryOptions<GetResponse<P>, Error, TData>,
      'queryKey' | 'queryFn'
    >,
  ) => {
    void method
    return useQuery<GetResponse<P>, Error, TData>({
      queryKey: ['GET', path, init],
      queryFn: async () => {
        const fn = client.GET as unknown as LooseFn
        const result = await fn(path, init)
        if (result.error) {
          throw new Error(formatError(result.error, result.response))
        }
        return unwrapEnvelope(result.data) as GetResponse<P>
      },
      ...options,
    })
  }

  const useApiMutation = <
    M extends WriteMethod,
    P extends PathsWithMethod<paths, LowerMethod<M>>,
    TData = WriteResponse<M, P>,
    TVariables = WriteInit<M, P>,
  >(
    method: M,
    path: P,
    options?: Omit<
      UseMutationOptions<TData, Error, TVariables>,
      'mutationKey' | 'mutationFn'
    >,
  ) => {
    return useMutation<TData, Error, TVariables>({
      mutationKey: [method, path],
      mutationFn: async (variables) => {
        const fn = client[method] as unknown as LooseFn
        const result = await fn(path, variables)
        if (result.error) {
          throw new Error(formatError(result.error, result.response))
        }
        return unwrapEnvelope(result.data) as TData
      },
      ...options,
    })
  }

  return { useApiQuery, useApiMutation }
}

// 後端統一回應 { success, data, timestamp }；剝開外殼回傳 data，沒有 data 欄位則回傳原值
const unwrapEnvelope = (body: unknown): unknown => {
  if (
    typeof body === 'object' &&
    body !== null &&
    'success' in body &&
    'data' in body
  ) {
    return (body as { data: unknown }).data
  }
  return body
}

// 後端 GlobalExceptionFilter 統一錯誤格式 { code, message }；嘗試萃取訊息給 ApiError
const formatError = (error: unknown, response: Response): string => {
  if (typeof error === 'object' && error !== null) {
    const obj = error as { message?: string; code?: string }
    if (obj.message) return obj.message
    if (obj.code) return obj.code
  }
  if (typeof error === 'string') return error
  return `API ${response.status}`
}
