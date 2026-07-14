import { defineConfig } from 'eslint/config';
import baseConfig, { houseRules } from '@app/eslint-config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

/** ORM / 測試邊界共通放寬:查詢結果與 jest mock 天生為 any,no-unsafe-* 在此為雜訊非 bug */
const noUnsafeOff = {
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
};

export default defineConfig([
  // 共用基底:ignores + js recommended（不含 tseslint 預設,由本檔自帶）
  ...baseConfig,
  // 疊上 type-aware 規則(需 api 自身 tsconfig,故不放共用基底)
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        // typescript-eslint v8 新式 project 解析:自動對應最近的 tsconfig
        //(tsconfig.json 已涵蓋 src / scripts / seeds,無需逐一列 project）
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // 家規最後套:蓋回 recommendedTypeChecked 重新開成 error 的 no-explicit-any 等
  houseRules,
  // Prisma 持久層是 ORM 邊界:查詢結果 / mapper 天生 any,關掉 no-unsafe-* 家族
  {
    files: ['src/adapter/out/persistence/**/*.ts'],
    rules: { ...noUnsafeOff },
  },
  // seeds / 一次性腳本:資料組裝為主,同樣放寬 no-unsafe-*
  {
    files: ['seeds/**/*.ts', 'scripts/**/*.ts'],
    rules: { ...noUnsafeOff },
  },
  // 測試碼:jest mock 回傳 any、supertest res.body 為 any、unbound method 取用皆為慣例
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      ...noUnsafeOff,
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  // prettier 放最後:關掉與 prettier 衝突的格式規則,並把 prettier 違規當 lint error
  eslintPluginPrettierRecommended,
]);
