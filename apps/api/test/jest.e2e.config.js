/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.e2e.ts'],
  // 確保測試庫存在 + migrate deploy（守門僅 *_test 庫）
  globalSetup: '<rootDir>/test/global-setup.ts',
  // 所有 spec 共用同一測試庫，序列執行避免互相 deleteMany race
  maxWorkers: 1,
  // Block B 待轉真 DB：這幾支仍餵 mockPrisma、斷言 mock 行為，暫時排除
  testPathIgnorePatterns: [
    '/node_modules/',
    '(member|role|security)\\.e2e-spec\\.ts$',
  ],
  forceExit: true,
};
