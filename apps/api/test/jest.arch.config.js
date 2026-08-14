/**
 * 架構守則測試的獨立 jest 設定。
 *
 * 與單元測試（package.json 的 jest 欄位，rootDir: src）分開的理由：架構測試放在 test/ 目錄，
 * 主設定的 rootDir 掃不到；而改主設定的 rootDir 會位移 coverageThreshold 的統計分母。
 * 此處純靜態掃描原始碼，不需要 setupFiles / DB / Redis。
 *
 * @type {import('jest').Config}
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: 'test/architecture/.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
};
