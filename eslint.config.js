// ESLint: catches what the TypeScript compiler doesn't (forgotten await, React hook mistakes, …).
// Run: npm run lint   (also part of npm run release:test)
// Not linted here: supabase/functions (Deno – `deno lint`), native projects, build output.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'android', 'ios', 'supabase/functions', 'node_modules', 'test-results', 'playwright-report', 'screenshots', 'website', 'assets'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { projectService: { allowDefaultProject: ['playwright.config.ts'] }, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The two classic hook rules. Not the newer React-Compiler rules of the plugin (refs, set-state-in-effect, …):
      // the app doesn't use the compiler, and they flag deliberate patterns (latest-value refs, loading in effects).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Promises: a forgotten await loses errors and order. `void promise` marks "on purpose".
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/await-thenable': 'error',
      // tsc already reports unused locals / parameters (tsconfig); `_name` = unused on purpose.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },

  {
    files: ['tests/**/*.{ts,tsx}', '*.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Debug screen (dev builds): logging is its job.
  { files: ['src/features/debug/**'], rules: { 'no-console': 'off' } },

  {
    files: ['scripts/**/*.{js,mjs}', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
