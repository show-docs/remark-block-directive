import { expect } from 'vitest';

import { remark } from 'remark';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdx from 'remark-mdx';
import { removePosition } from 'unist-util-remove-position';

import { remarkBlockDirective } from '../../src/index.mts';
import type { Nodes, RootContent } from 'mdast';

/**
 * 去除节点树中的位置信息，并返回其子节点列表（用于快照）。
 */
function removePST(ast: Nodes): RootContent[] {
  removePosition(ast, { force: true });

  return 'children' in ast ? ast.children : [];
}

/**
 * 递归收集节点树中出现的所有节点类型，用于校验 mode 行为不变量。
 */
function collectTypes(nodes: readonly RootContent[]): string[] {
  const types: string[] = [];

  for (const node of nodes) {
    types.push(node.type);

    if ('children' in node) {
      types.push(...collectTypes(node.children));
    }
  }

  return types;
}

/**
 * 报告中的一个区块：标题 + 内容，用于拼接每个用例的独立快照文件。
 */
function section(title: string, body: string): string {
  return `=== ${title} ===\n\n${body.trim()}\n`;
}

/**
 * 渲染与 mode 无关的解析结果：`input` 与 `ast`（两种 mode 共用，避免重复）。
 */
export function renderParse(input: string): string {
  const instance = remark()
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkDirective)
    .use(remarkMdx);

  const ast = instance.parse(input);

  return [
    section('input', input),
    section('ast', JSON.stringify(removePST(ast), null, 2)),
  ].join('\n');
}

/**
 * 按 `mode` 渲染转换结果：`parsed` / `output1` / `output2` 区块带 mode 前缀。
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
export async function renderTransform(
  input: string,
  mode: 'mdx' | 'html',
): Promise<string> {
  const instance = remark()
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkDirective)
    .use(remarkBlockDirective, mode === 'mdx' ? undefined : { mode });

  if (mode === 'mdx') {
    instance.use(remarkMdx);
  }

  const ast = instance.parse(input);
  // `run` 就地变换并复用同一 `Root` 实例，故直接使用已知类型的 `ast`，
  // 避免 `run` 返回的宽松 `Node` 类型需要断言。
  await instance.run(ast);
  const tree = removePST(ast);

  const types = collectTypes(tree);

  // 单一 mode 下不应出现另一 mode 专属的节点类型
  if (mode === 'html') {
    expect(types).not.toContain('mdxJsxFlowElement');
  } else {
    expect(types).not.toContain('html');
  }

  const output1 = await instance
    .process(input)
    .then((file) => file.toString().trim());

  const output2 = await instance
    .process(output1)
    .then((file) => file.toString().trim());

  return [
    section(`${mode} > parsed`, JSON.stringify(tree, null, 2)),
    section(`${mode} > output1`, output1),
    section(`${mode} > output2`, output2),
  ].join('\n');
}

/**
 * 为单个 fixture 生成完整报告并断言到独立快照文件
 * `test/__snapshots__/<name>.md.snap`。
 */
export async function matchFixtureSnapshot(
  name: string,
  input: string,
): Promise<void> {
  const parts = [renderParse(input)];

  for (const mode of ['mdx', 'html'] as const) {
    parts.push(await renderTransform(input, mode));
  }

  await expect(parts.join('\n')).toMatchFileSnapshot(
    `./__snapshots__/${name}.md.snap`,
  );
}
