import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { remarkBlockDirective } from '../src/index.mts';
import type { Root } from 'mdast';
import type { ContainerDirective } from 'mdast-util-directive';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';

import { matchFixtureSnapshot } from './helper/lib.mts';

const fixtureDir = new URL('./fixture/', import.meta.url);

// 按文件名前缀推断所属分组，便于 `describe` 归类。
// 每个 `test/fixture/<name>.md` 对应一个用例，
// 快照写入独立文件 `test/__snapshots__/<name>.md.snap`。
function groupOf(name: string): string {
  if (name.startsWith('block-break')) return 'blockBreak：容器内部分页';
  if (name.startsWith('page-break')) return 'pageBreak：根级分页';
  if (name.startsWith('config-')) return '配置读取';
  return '基础转换（container directive）';
}

const GROUP_ORDER = [
  '基础转换（container directive）',
  'blockBreak：容器内部分页',
  'pageBreak：根级分页',
  '配置读取',
];

const fixtures = readdirSync(fixtureDir)
  .filter((file) => file.endsWith('.md'))
  .map((file) => file.slice(0, -'.md'.length));

const buckets = new Map<string, string[]>();
for (const name of fixtures) {
  const group = groupOf(name);
  const list = buckets.get(group);
  if (list) {
    list.push(name);
  } else {
    buckets.set(group, [name]);
  }
}

for (const group of GROUP_ORDER) {
  const names = buckets.get(group) ?? [];
  if (names.length > 0) {
    describe(group, () => {
      for (const name of names) {
        test(name, async () => {
          const input = readFileSync(new URL(`${name}.md`, fixtureDir), 'utf8');

          await matchFixtureSnapshot(name, input);
        });
      }
    });
  }
}

// 验证 `readConfig` 只读取顶层首个 frontmatter：当 AST 中存在多个 `yaml`
// 节点时，应忽略非首个（如嵌套或后续出现的）frontmatter。
describe('配置读取', () => {
  test('只读取顶层首个 frontmatter 作为配置', () => {
    const container: ContainerDirective = {
      type: 'containerDirective',
      name: 'div',
      attributes: {},
      children: [
        { type: 'paragraph', children: [{ type: 'text', value: 'A' }] },
        { type: 'thematicBreak' },
        { type: 'paragraph', children: [{ type: 'text', value: 'B' }] },
      ],
    };

    const tree: Root = {
      type: 'root',
      children: [
        { type: 'yaml', value: 'blockBreak: false' },
        { type: 'yaml', value: 'blockBreak: true' },
        container,
      ],
    };

    // 直接运行插件的 transformer（就地变换），无需完整 remark 管道。
    remarkBlockDirective()(tree);

    // 只取首个 `blockBreak: false` → 不分页，div 应仍为单个 `mdxJsxFlowElement`。
    // （旧实现遍历全部 `yaml` 取最后一个 `true`，会分页成 2 个 div，断言失败。）
    const divs = tree.children.filter(
      (node): node is MdxJsxFlowElement => node.type === 'mdxJsxFlowElement',
    );

    expect(divs).toHaveLength(1);
  });
});
