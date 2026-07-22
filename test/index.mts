/// <reference types="vite/client" />
import { expect, test } from 'vitest';

import { remark } from 'remark';
import remarkDirective from 'remark-directive';
import remarkMdx from 'remark-mdx';
import { remarkBlockDirective } from '../lib/index.mjs';

import { TransformSnapshot } from './helper/lib.mts';

const fixtures = import.meta.glob('./fixture/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

for (const [path, input] of Object.entries(fixtures)) {
  const name = path.replace(/^.*\//, '').replace(/\.md$/, '');

  test(name, async () => {
    await TransformSnapshot(input);
  });
}

// 验证 `readConfig` 只读取顶层首个 frontmatter：当 AST 中存在多个 `yaml`
// 节点时，应忽略非首个（如嵌套或后续出现的）frontmatter。
test('only the first top-level frontmatter is used for config', async () => {
  const tree = {
    type: 'root',
    children: [
      { type: 'yaml', value: 'blockBreak: false' },
      { type: 'yaml', value: 'blockBreak: true' },
      {
        type: 'containerDirective',
        name: 'div',
        attributes: {},
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'A' }] },
          { type: 'thematicBreak' },
          { type: 'paragraph', children: [{ type: 'text', value: 'B' }] },
        ],
      },
    ],
  };

  const instance = remark()
    .use(remarkMdx)
    .use(remarkDirective)
    .use(remarkBlockDirective);

  const result = (await instance.run(tree as any)) as any;

  // 只取首个 `pageBreak: false` → 不分页，div 应仍为单个 `mdxJsxFlowElement`。
  // （旧实现遍历全部 `yaml` 取最后一个 `true`，会分页成 2 个 div，断言失败。）
  const divs = result.children.filter(
    (node: any) => node.type === 'mdxJsxFlowElement',
  );

  expect(divs).toHaveLength(1);
});
