import YAML from 'yaml';

import type { MdxJsxAttribute } from 'mdast-util-mdx-jsx';
import type { Root, RootContent } from 'mdast';

/** 转换模式。 */
type Mode = 'mdx' | 'html';

/** directive 属性值类型（`remark-directive` 允许 `null`/`undefined` 空值）。 */
type DirectiveAttributes = Record<string, string | null | undefined>;

/**
 * 可被本插件处理的任意 mdast 节点的递归形态，用于遍历异构的 mdast 子树。
 */
type AnyNode = {
  type: string;
  name?: string | null;
  attributes?: unknown;
  children?: AnyNode[];
  value?: string;
  data?: unknown;
};

/** 待转换的 HTML 标签型 containerDirective（属性已是 `Record` 形态）。 */
interface DirectiveNode {
  type: 'containerDirective';
  name: string;
  attributes?: DirectiveAttributes;
  children: AnyNode[];
  data?: unknown;
}

/** 会被转换为对应 `mdxJsxFlowElement` 的 HTML 标签型 containerDirective。 */
const convertibleTags = [
  'article',
  'aside',
  'details',
  'dialog',
  'div',
  'footer',
  'header',
  'main',
  'section',
  'summary',
];

/**
 * 允许按 `---` 分割线断开分页的容器。
 * 与 {@link convertibleTags} 解耦，便于单独控制哪些标签参与分页
 * （例如结构性标签 `summary` 可视需要移出本列表）。
 */
const splittableTags = [
  'article',
  'aside',
  'details',
  'div',
  'footer',
  'header',
  'main',
  'section',
];

/**
 * 将 `className`/`id` 属性值转义，避免在 `mode: 'html'` 下输出非法 HTML。
 */
function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * 读取顶层首个 frontmatter（`yaml` 节点）中的配置。
 * 仅取首个，忽略后续/嵌套出现的 frontmatter。
 */
function readConfig(tree: Root): { blockBreak?: boolean } {
  const node = tree.children.find((child) => child.type === 'yaml');

  if (!node || node.value == null) {
    return {};
  }

  try {
    return (YAML.parse(node.value) ?? {}) as { blockBreak?: boolean };
  } catch {
    // ignore invalid yaml
    return {};
  }
}

/**
 * 按 `---` 分割线将容器拆分为多个同型容器。
 * 若无分割线则返回原节点（单元素数组），保持调用方统一处理。
 */
function splitByBreak(node: DirectiveNode): DirectiveNode[] {
  const parts: AnyNode[][] = [];
  let current: AnyNode[] = [];

  for (const child of node.children) {
    if (child.type === 'thematicBreak') {
      parts.push(current);
      current = [];
    } else {
      current.push(child);
    }
  }

  parts.push(current);

  if (parts.length === 1) {
    return [node];
  }

  return parts
    .filter((part) => part.length > 0)
    .map((children) => ({ ...node, children }));
}

/**
 * 将 HTML 标签型 containerDirective 转换为 `mdxJsxFlowElement`（MDX 体系）。
 */
function toMdxJsx(node: DirectiveNode): AnyNode[] {
  const candidates: MdxJsxAttribute[] = [
    {
      type: 'mdxJsxAttribute',
      name: 'className',
      value: node.attributes?.class,
    },
    { type: 'mdxJsxAttribute', name: 'id', value: node.attributes?.id },
  ];
  const attributes = candidates.filter(({ value }) => value !== undefined);

  return [
    {
      type: 'mdxJsxFlowElement',
      name: node.name,
      attributes,
      children: node.children,
    },
  ];
}

/**
 * 将 HTML 标签型 containerDirective 转换为一组原生 `html` 节点
 * （开标签 + 子节点 + 闭标签），以便在纯 remark-rehype 体系下无需 MDX 即可渲染。
 */
function toHtmlFlow(node: DirectiveNode): AnyNode[] {
  const attrs: string[] = [];

  const className = node.attributes?.class;
  if (className) {
    attrs.push(`class="${escapeHtml(className)}"`);
  }

  const id = node.attributes?.id;
  if (id) {
    attrs.push(`id="${escapeHtml(id)}"`);
  }

  const open = `<${node.name}${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>`;

  return [
    { type: 'html', value: open },
    ...node.children,
    { type: 'html', value: `</${node.name}>` },
  ];
}

/** 类型守卫：判断节点是否为可转换的 containerDirective。 */
function isContainerDirective(node: AnyNode): node is DirectiveNode {
  return node.type === 'containerDirective' && typeof node.name === 'string';
}

/**
 * 递归遍历节点列表：先处理子节点，再将 HTML 标签型 `containerDirective`
 * 按 `mode` 转换为目标节点；若开启分页且标签可分页，则先按 `---` 拆分为多个容器。
 *
 * 通过单次遍历同时完成「子节点转换 → 分页拆分 → 节点转换」，
 * 替代原先 `splitTree` 与 `transformNodes` 的两次独立递归。
 */
function transformNodes(
  nodes: AnyNode[],
  context: { mode: Mode; pageBreak: boolean },
): AnyNode[] {
  const result: AnyNode[] = [];

  for (const node of nodes) {
    const children = node.children
      ? transformNodes(node.children, context)
      : [];
    const current: AnyNode = node.children ? { ...node, children } : node;

    if (isContainerDirective(node) && convertibleTags.includes(node.name)) {
      const source: DirectiveNode = { ...node, children };
      const parts: DirectiveNode[] =
        context.pageBreak && splittableTags.includes(node.name)
          ? splitByBreak(source)
          : [source];

      for (const part of parts) {
        result.push(
          ...(context.mode === 'html' ? toHtmlFlow(part) : toMdxJsx(part)),
        );
      }
    } else {
      result.push(current);
    }
  }

  return result;
}

/**
 * 将 HTML 标签型 containerDirective 转换为 MDX 标签或原生 `html` 节点，
 * 并按 frontmatter 中的 `blockBreak` 配置对容器按 `---` 分割线分页。
 *
 * @param mode 转换模式。
 *   - `'mdx'`（默认）：转换为 `mdxJsxFlowElement`，需配合 `remark-mdx` 使用。
 *   - `'html'`：转换为原生 `html` 节点，可在纯 remark-rehype 体系（无需 MDX）下工作，
 *     此时下游 `remark-rehype` 需设置 `allowDangerousHtml: true`。
 *
 * @remarks
 * 前置依赖：管道中必须在本插件之前接入 frontmatter 解析器（如 `remark-frontmatter`），
 * 否则 AST 中不会存在 `yaml` 节点，`blockBreak` 配置将无法被读取（详情见 README）。
 */
function transform(tree: Root, mode: Mode = 'mdx'): void {
  const config = readConfig(tree);

  tree.children = transformNodes(tree.children, {
    mode,
    pageBreak: config.blockBreak === true,
  }) as RootContent[];
}

interface Options {
  mode?: Mode;
}

export function remarkBlockDirective(options: Options = {}) {
  const { mode = 'mdx' } = options;

  return (tree: Root) => {
    transform(tree, mode);
  };
}
