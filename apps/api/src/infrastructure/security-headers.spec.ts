import { isDocsPath, SWAGGER_SIDES } from './security-headers';

describe('isDocsPath', () => {
  it.each([
    '/api/admin/docs',
    '/api/front/docs',
    '/api/admin/docs/swagger-ui.css',
    '/api/admin/docs/swagger-ui-bundle.js',
  ])('%s → 屬於 Swagger UI，CSP 放寬', (path) => {
    expect(isDocsPath(path)).toBe(true);
  });

  // docs-json 是 JSON 不是 UI，不需要放寬——用 startsWith(base) 會把它一起吃進來
  it.each([
    '/api/admin/docs-json',
    '/api/front/docs-json',
    '/api/admin/docsomething',
    '/api/admin/members',
    '/api/admin',
    '/',
  ])('%s → 不放寬', (path) => {
    expect(isDocsPath(path)).toBe(false);
  });
});

describe('SWAGGER_SIDES', () => {
  // 掛載位置與 CSP 豁免範圍是同一份資料。分成兩處寫的話，
  // 漏掉其中一條的症狀是「那份文件打不開」，會被當成 Swagger 壞掉去查。
  it('涵蓋前後台兩側，且每側都有 basePath 與 bundle', () => {
    expect(SWAGGER_SIDES).toHaveLength(2);
    expect(SWAGGER_SIDES.map((s) => s.basePath)).toEqual([
      '/api/admin',
      '/api/front',
    ]);
    for (const side of SWAGGER_SIDES) {
      expect(side.bundle).toMatch(/^docs\/swagger\/.+\/openapi\.bundle\.yaml$/);
    }
  });

  it('每一側的 docs 路徑都在豁免範圍內', () => {
    for (const side of SWAGGER_SIDES) {
      expect(isDocsPath(`${side.basePath}/docs`)).toBe(true);
    }
  });
});
