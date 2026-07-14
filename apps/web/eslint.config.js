import { defineConfig } from 'eslint/config';
import baseConfig, { houseRules } from '@app/eslint-config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default defineConfig([
  // 共用基底:ignores + js recommended（不含 tseslint 預設,由本檔自帶）
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // 家規最後套:蓋回 tseslint recommended 的 no-explicit-any 等（與 api 一致）
  houseRules,
  // shadcn/ui 元件直接從官方 registry copy，內含 hook 與元件同檔、effect 內 setState 等
  // 與專案規範不同的模式。為避免每次 `shadcn add` 都要手動改 disable 註解，這裡集中關掉相關規則
  {
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/hooks/use-mobile.ts'],
    rules: {
      'react-refresh/only-export-components': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
