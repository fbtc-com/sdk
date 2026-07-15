import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import unusedImportsPlugin from 'eslint-plugin-unused-imports';

export default [
  // Global ignores
  {
    ignores: [
      '**/build/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/.yarn/**',
      '**/coverage/**',
      '**/.turbo/**',
    ],
  },

  // Base configuration for all JavaScript/TypeScript files
  {
    files: [
      '**/*.js',
      '**/*.jsx',
      '**/*.ts',
      '**/*.tsx',
      '**/*.mjs',
      '**/*.cjs',
    ],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'unused-imports': unusedImportsPlugin,
      'simple-import-sort': simpleImportSortPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      'no-useless-catch': 'error',
      'no-extra-boolean-cast': 'error',
      'no-with': 'error',

      'no-const-assign': 'error',
      'no-constant-condition': 'error',
      'no-empty-pattern': 'error',
      'no-global-assign': 'error',
      'no-invalid-regexp': 'error',
      'constructor-super': 'error',
      'no-loss-of-precision': 'error',
      'no-self-assign': ['error', { props: true }],
      'no-setter-return': 'error',
      'no-case-declarations': 'error',
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-unused-labels': 'error',
      'use-isnan': 'error',
      'for-direction': 'error',

      // Style rules
      'no-var': 'error',
      'prefer-const': 'error',

      // Suspicious rules
      'no-async-promise-executor': 'error',
      'no-class-assign': 'error',
      'no-compare-neg-zero': 'error',
      'no-control-regex': 'error',
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-empty': 'error',
      'no-ex-assign': 'error',
      'no-fallthrough': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-misleading-character-class': 'error',
      'no-prototype-builtins': 'error',
      'no-redeclare': 'error',
      'no-shadow-restricted-names': 'error',
      'no-sparse-arrays': 'error',
      'no-unsafe-negation': 'error',
      'getter-return': 'error',
      'valid-typeof': 'error',

      // TypeScript-specific rules
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-unnecessary-type-constraint': 'error',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/no-extra-non-null-assertion': 'error',

      // React rules
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
    },
  },

  // TypeScript-specific overrides
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    rules: {
      // Disable rules that TypeScript handles better
      'no-const-assign': 'off',
      'no-global-assign': 'off',
      'constructor-super': 'off',
      'no-setter-return': 'off',
      'no-undef': 'off',
      'no-unreachable': 'off',
      'no-dupe-class-members': 'off',
      'no-dupe-keys': 'off',
      'no-dupe-args': 'off',
      'no-func-assign': 'off',
      'no-import-assign': 'off',
      'no-redeclare': 'off',
      'no-unsafe-negation': 'off',
      'getter-return': 'off',

      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  // Config files can use CommonJS
  {
    files: [
      '**/*.config.js',
      '**/*.config.cjs',
      '**/vite.config.ts',
      '**/.eslintrc.cjs',
    ],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
];
