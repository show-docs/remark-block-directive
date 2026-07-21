import { expect } from 'vitest';

import { remark } from 'remark';
import remarkDirective from 'remark-directive';
import remarkMdx from 'remark-mdx';
import { removePosition } from 'unist-util-remove-position';

import { remarkBlockDirective } from '../../lib/index.mjs';
import type { Node } from 'unist';

function removePST(ast: Node) {
  removePosition(ast, { force: true });

  return (ast as any).children;
}

export async function TransformSnapshot(input: string) {
  const instance = remark()
    .use(remarkMdx)
    .use(remarkDirective)
    .use(remarkBlockDirective);

  const ast = instance.parse(input);

  expect(input).toMatchSnapshot('input');
  expect(removePST(ast)).toMatchSnapshot('ast');

  const tree = removePST(await instance.run(ast));

  expect(tree).toMatchSnapshot('parsed');

  const output1 = await instance
    .process(input)
    .then((file) => file.toString().trim());

  expect(output1).toMatchSnapshot('output1');

  const output2 = await instance
    .process(output1)
    .then((file) => file.toString().trim());

  expect(output2).toMatchSnapshot('output2');
}
