import configs from '@nice-move/all-in-base/eslint';

export default [
  ...configs,
  {
    files: ['**/*.mts', '**/*.cts', '**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    ignores: ['test/fixture/**', 'coverage/**'],
  },
];
