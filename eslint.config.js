import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['vendor/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', '.scratch/**', 'docs/**', '.site-e2e/**', '_site/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // bug-indicating rules beyond "recommended"
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-shadow': 'warn',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      'no-unreachable-loop': 'error',
      'no-constant-binary-expression': 'error',
      'no-promise-executor-return': 'error',
      'no-await-in-loop': 'off',
      'array-callback-return': 'error',
      'default-case-last': 'error',
      'no-loss-of-precision': 'error',
      'require-atomic-updates': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
