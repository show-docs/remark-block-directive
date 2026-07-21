import { test } from 'vitest';

import { TransformSnapshot } from './helper/lib.mts';

test.each([
  [
    'not html',
    `
::::text

abc

::::
`,
  ],
  [
    'html',
    `
:::::details

::::summary
abc
::::

:::::
`,
  ],
  [
    'class and id',
    `
::::div{#id.class}

abc

::::
`,
  ],
])('%s', async (_name, input) => {
  await TransformSnapshot(input);
});
