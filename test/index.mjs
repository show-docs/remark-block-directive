import test from 'ava';

import { TransformSnapshot } from './helper/lib.mjs';

test(
  'not html',
  TransformSnapshot,
  `
:::text

abc

:::
`,
);

test(
  'html',
  TransformSnapshot,
  `
::::details

:::summary
abc
:::

::::
`,
);

test(
  'class and id',
  TransformSnapshot,
  `
:::div{#id.class}

abc

:::
`,
);
