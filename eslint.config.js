import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // React 19 Compiler rules — ปรับเป็น warning เพื่อไม่ให้บล็อกการทำงาน และใช้เป็นแนวทาง optimize
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // ละเว้นตัวแปรที่ไม่ได้ใช้หากขึ้นต้นด้วย underscore (เช่น _ หรือ _err)
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // อนุญาต catch block ที่ว่างเปล่าสำหรับการจัดการ error ที่ไม่จำเป็นต้องแสดงผล
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
])
