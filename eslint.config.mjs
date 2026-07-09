import configs from '@nice-move/all-in-base/eslint';

export default [
  ...configs,
  {
    ignores: ['test/fixture/**'],
  },
];
