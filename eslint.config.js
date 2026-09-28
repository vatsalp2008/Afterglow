import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/dist',
    '**/coverage',
    '**/playwright-report',
    '**/test-results',
    '**/.turbo',
    'apps/web/public',
    'ml',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // With noUncheckedIndexedAccess, `!` after an explicit bounds check is the idiom.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Numbers in template strings (px values, counts) are intended.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // `onClick={() => studio.undo()}` is clearer than wrapping every handler in braces.
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },

  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['apps/web/src/**/*.tsx', 'packages/ui/src/**/*.tsx'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
  },

  // The core package must stay pure: no DOM, clock, or randomness (see its README).
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core must not touch the DOM.' },
        { name: 'document', message: 'core must not touch the DOM.' },
        { name: 'navigator', message: 'core must not touch the DOM.' },
        { name: 'performance', message: 'Pass time in instead of reading a clock.' },
        { name: 'requestAnimationFrame', message: 'core must not schedule work.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Pass time in instead of reading a clock.' },
        { object: 'Math', property: 'random', message: 'Pass randomness in so behavior stays deterministic.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'Pass time in instead of reading a clock.' },
        ...['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration'].map((node) => ({
          selector: `${node}[source.value=/^\\.\\.?\\/(?!.*\\.ts$)/]`,
          message: 'Relative imports in core need an explicit .ts extension, so Node can run core directly.',
        })),
      ],
    },
  },

  prettier,
]);
