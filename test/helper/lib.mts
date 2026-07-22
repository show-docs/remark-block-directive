import { expect } from 'vitest';

import { remark } from 'remark';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdx from 'remark-mdx';
import { removePosition } from 'unist-util-remove-position';

import { remarkBlockDirective } from '../../lib/index.mjs';
import type { Node } from 'unist';

function removePST(ast: Node) {
  removePosition(ast, { force: true });

  return (ast as any).children;
}

/**
 * 递归收集节点树中出现的所有节点类型，用于校验 mode 行为不变量。
 */
function collectTypes(nodes: Node[]): string[] {
  const types: string[] = [];

  for (const node of nodes) {
    types.push((node as any).type);

    if ((node as any).children) {
      types.push(...collectTypes((node as any).children));
    }
  }

  return types;
}

/**
 * 快照与 mode 无关的解析结果：`input` 与 `ast`（两种 mode 共用，避免重复快照）。
 */
export async function SnapshotParse(input: string) {
  const instance = remark()
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkDirective)
    .use(remarkMdx);

  const ast = instance.parse(input);

  expect(input).toMatchSnapshot('input');
  expect(removePST(ast)).toMatchSnapshot('ast');
}

/**
 * 按 `mode` 快照转换结果：`parsed` / `output1` / `output2` 在快照名中带 mode 前缀，
 * 以便区分两种模式且不重复快照共享的 `input` / `ast`。
 *
 * 同时校验行为不变量：单一 mode 下绝不出现另一 mode 专属的节点类型
 * （`html` 模式不含 `mdxJsxFlowElement`，`mdx` 模式不含 `html`）。
 * 这比单纯的快照比对更能防止回归——即使遇到不可转换标签（如 `:::text`），
 * 断言也仅检查互斥性而不过度要求「必须出现某类节点」。
 *
 * @remarks
 * `mdx` 模式需 `remark-mdx` 才能将 `mdxJsxFlowElement` 序列化为 HTML；
 * `html` 模式使用原生 `html` 节点，无需 `remark-mdx`。
 */
export async function SnapshotTransform(input: string, mode: 'mdx' | 'html') {
  const instance = remark()
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkDirective)
    .use(remarkBlockDirective, mode === 'mdx' ? undefined : { mode });

  if (mode === 'mdx') {
    instance.use(remarkMdx);
  }

  const ast = instance.parse(input);
  const tree = removePST(await instance.run(ast));

  const types = collectTypes(tree);

  // 单一 mode 下不应出现另一 mode 专属的节点类型
  if (mode === 'html') {
    expect(types).not.toContain('mdxJsxFlowElement');
  } else {
    expect(types).not.toContain('html');
  }

  expect(tree).toMatchSnapshot(`${mode} > parsed`);

  const output1 = await instance
    .process(input)
    .then((file) => file.toString().trim());

  expect(output1).toMatchSnapshot(`${mode} > output1`);

  const output2 = await instance
    .process(output1)
    .then((file) => file.toString().trim());

  expect(output2).toMatchSnapshot(`${mode} > output2`);
}
