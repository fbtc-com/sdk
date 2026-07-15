import rootConfig from '../../eslint.config.js';

export default [
  {
    ignores: ['vite.config.ts', 'vitest.config.ts'],
  },
  ...rootConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];
