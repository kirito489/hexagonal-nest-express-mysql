import { load } from 'js-yaml';
import { collectSourceFiles, readSource } from './helpers';

/** 一條路由的正規化表示：`METHOD /api/admin/members/{id}` */
export type Route = string;

const HTTP_METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;

/** OpenAPI 文件中我們用得到的部分 */
type OpenApiDoc = {
  servers?: Array<{ url?: string }>;
  paths?: Record<string, Record<string, unknown>>;
};

/**
 * 正規化路由 path：合併重複斜線、去掉結尾斜線
 * @param path - 原始路徑
 */
const normalizePath = (path: string): string =>
  `/${path}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');

/** 解析 yaml 並取出我們用得到的欄位 */
const parseOpenApi = (file: string): OpenApiDoc => {
  // 不能用 regex 解析：多行 description 區塊的內容會被誤判成 path / method 節點
  const doc = load(readSource(file));
  return typeof doc === 'object' && doc !== null ? doc : {};
};

/**
 * 取得 OpenAPI 文件的 servers base path
 * @param file - 相對 apps/api 的 yaml 路徑
 * @returns base path，例：/api/admin
 */
export const serverBaseOf = (file: string): string => {
  const serverUrl = parseOpenApi(file).servers?.[0]?.url ?? '';
  // servers.url 可能是完整網址（取 pathname）或已是路徑
  return serverUrl.startsWith('http') ? new URL(serverUrl).pathname : serverUrl;
};

/**
 * 解析 OpenAPI yaml，取出「含 servers base path」的完整路由集合
 * @param file - 相對 apps/api 的 yaml 路徑
 * @returns 正規化後的路由集合
 */
export const routesFromOpenApi = (file: string): Set<Route> => {
  const parsed = parseOpenApi(file);
  const base = serverBaseOf(file);

  const routes = new Set<Route>();
  for (const [path, operations] of Object.entries(parsed.paths ?? {})) {
    for (const method of Object.keys(operations)) {
      if (HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) {
        routes.add(
          `${method.toUpperCase()} ${normalizePath(`${base}${path}`)}`,
        );
      }
    }
  }
  return routes;
};

/**
 * 從 controller 原始碼取出實際註冊的路由
 * @returns 正規化後的路由集合（`:param` 已轉為 `{param}`）
 */
export const routesFromControllers = (): Set<Route> => {
  const files = collectSourceFiles(['src/adapter/in/web'], {
    exclude: ['.spec.ts'],
  }).filter((file) => file.endsWith('Controller.ts'));

  const routes = new Set<Route>();
  for (const file of files) {
    const source = readSource(file);
    const controllerBase = /@Controller\('([^']*)'\)/.exec(source)?.[1] ?? '';

    for (const match of source.matchAll(
      /@(Get|Post|Patch|Put|Delete)\(\s*'?([^')]*)'?\s*\)/g,
    )) {
      const sub = match[2].replace(/'/g, '').trim();
      const path = normalizePath(
        `/api/${[controllerBase, sub].filter(Boolean).join('/')}`,
      ).replace(/:(\w+)/g, '{$1}');
      routes.add(`${match[1].toUpperCase()} ${path}`);
    }
  }
  return routes;
};

/**
 * 從 openapi-typescript 產物取出 paths interface 的 key
 * @param file - 相對 apps/api 的 schema.ts 路徑（可跨 workspace）
 * @param base - 對應的 servers base path，用於補齊成完整路由
 */
export const routesFromGeneratedSchema = (
  file: string,
  base: string,
): Set<Route> => {
  const source = readSource(file);
  const start = source.indexOf('export interface paths');
  const body = source.slice(start, source.indexOf('\nexport ', start + 1));

  const routes = new Set<Route>();
  // 產物格式固定為 `    "/path": {` 後接各 method 的定義，method 為 `        post: {`
  for (const block of body.split(/\n {4}"(?=\/)/).slice(1)) {
    const path = block.slice(0, block.indexOf('"'));
    for (const method of HTTP_METHODS) {
      // 只認實際定義（`post: {`），openapi-typescript 對未定義者輸出 `post?: never`
      if (new RegExp(`\\n {8}${method}: \\{`).test(block)) {
        routes.add(
          `${method.toUpperCase()} ${normalizePath(`${base}${path}`)}`,
        );
      }
    }
  }
  return routes;
};

/**
 * 比較兩組路由集合的差集，組成可讀報告
 * @param actual - 實際擁有的路由
 * @param expected - 應該要有的路由
 * @param labels - 兩側名稱，用於訊息
 */
export const diffRoutes = (
  actual: Set<Route>,
  expected: Set<Route>,
  labels: { actual: string; expected: string },
): string => {
  const missing = [...actual].filter((r) => !expected.has(r)).sort();
  const extra = [...expected].filter((r) => !actual.has(r)).sort();
  if (missing.length === 0 && extra.length === 0) return '';

  const lines: string[] = [];
  if (missing.length > 0) {
    lines.push(`只存在於${labels.actual}（${labels.expected}缺少）：`);
    lines.push(...missing.map((r) => `  ${r}`));
  }
  if (extra.length > 0) {
    lines.push(`只存在於${labels.expected}（${labels.actual}缺少）：`);
    lines.push(...extra.map((r) => `  ${r}`));
  }
  return lines.join('\n');
};
