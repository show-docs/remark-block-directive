import configs from '@nice-move/all-in-base/eslint';
import ava from 'eslint-plugin-ava';

export default [
  ...configs,
  {
    files: ['test/**/*.mjs'],
    ...ava.configs['flat/recommended'],
  },
  {
    ignores: ['test/fixture/**'],
  },
];
