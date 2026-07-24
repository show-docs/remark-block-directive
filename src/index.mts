import YAML from 'yaml';

import type { MdxJsxAttribute } from 'mdast-util-mdx-jsx';
import type { Root, RootContent, Yaml } from 'mdast';

type Mode = 'mdx' | 'html';

type DirectiveAttributes = Record<string, string | null | undefined>;

/**
 * 用于遍历/改写异构 mdast 子树的宽松节点形态：字段全部可选，
 * 避免联合类型在 spread 时的协变难题（不同节点的子节点类型各异）。
 */
type MdNode = {
  type: string;
  name?: string | null;
  attributes?: unknown;
  children?: MdNode[];
  value?: string;
  data?: unknown;
};

type DirectiveNode = MdNode & {
  type: 'containerDirective';
  name: string;
  attributes?: DirectiveAttributes | null;
  children: MdNode[];
};

/** 可转换为标签的 containerDirective 名称。 */
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

/** 允许按 `---` 分页拆分的容器（与 {@link convertibleTags} 解耦）。 */
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

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

interface Config {
  blockBreak?: boolean;
  pageBreak?: string;
}

/** 读取顶层首个 `yaml` frontmatter 中的 `blockBreak` / `pageBreak` 配置。 */
function readConfig(tree: Root): Config {
  const node = tree.children.find(
    (child): child is Yaml => child.type === 'yaml',
  );

  if (!node) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = YAML.parse(node.value);
  } catch {
    // ignore invalid yaml
    return {};
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {};
  }

  const config: Config = {};

  if ('blockBreak' in parsed && typeof parsed.blockBreak === 'boolean') {
    config.blockBreak = parsed.blockBreak;
  }

  if ('pageBreak' in parsed && typeof parsed.pageBreak === 'string') {
    config.pageBreak = parsed.pageBreak;
  }

  return config;
}

/** 按 `---`（thematicBreak）将节点序列拆分为若干段。 */
function splitByThematicBreak(nodes: MdNode[]): MdNode[][] {
  const groups: MdNode[][] = [];
  let current: MdNode[] = [];

  for (const node of nodes) {
    if (node.type === 'thematicBreak') {
      groups.push(current);
      current = [];
    } else {
      current.push(node);
    }
  }

  groups.push(current);

  return groups;
}

/** 类型守卫：判断节点是否为可转换的 containerDirective。 */
function isContainerDirective(node: MdNode): node is DirectiveNode {
  return node.type === 'containerDirective' && typeof node.name === 'string';
}

/** 将 containerDirective 按 `mode` 转换为 `mdxJsxFlowElement` 或原生 `html` 节点。 */
function convertDirective(node: DirectiveNode, mode: Mode): MdNode[] {
  if (mode === 'html') {
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
 * 递归转换：先处理子节点，再将可转换的 `containerDirective` 按 `mode` 转换；
 * 若开启 `blockBreak` 且标签可分页，则先按 `---` 拆分为多个同型容器。
 */
function transformNodes(
  nodes: MdNode[],
  context: { mode: Mode; blockBreak: boolean },
): MdNode[] {
  const result: MdNode[] = [];

  for (const node of nodes) {
    const children = node.children
      ? transformNodes(node.children, context)
      : [];
    const current: MdNode = node.children ? { ...node, children } : node;

    if (isContainerDirective(node) && convertibleTags.includes(node.name)) {
      const source: DirectiveNode = { ...node, children };
      const parts: DirectiveNode[] =
        context.blockBreak && splittableTags.includes(node.name)
          ? splitByThematicBreak(children)
              .filter((part) => part.length > 0)
              .map((part) => ({ ...source, children: part }))
          : [source];

      for (const part of parts) {
        result.push(...convertDirective(part, context.mode));
      }
    } else {
      result.push(current);
    }
  }

  return result;
}

/**
 * 在 root 级别按 `---` 分页：将每段内容包裹进 `div{.<className>}`。
 * 第一个 `---` **之前**的内容保持原样（不包裹）；其后每段各包裹一个 `div`。
 * 顶层 `yaml`（frontmatter）与 `mdxjsEsm`（`import`/`export`）被保留在包裹层之外。
 * 仅当存在 root 级分割线时才包裹，保证重复处理幂等。
 */
function applyPageBreak(
  nodes: MdNode[],
  className: string,
  mode: Mode,
): MdNode[] {
  const leading: MdNode[] = [];
  let start = 0;
  for (const node of nodes) {
    if (node.type === 'yaml') {
      leading.push(node);
      start++;
    } else {
      break;
    }
  }

  const esm: MdNode[] = [];
  const body: MdNode[] = [];
  for (const node of nodes.slice(start)) {
    if (node.type === 'mdxjsEsm') {
      esm.push(node);
    } else {
      body.push(node);
    }
  }

  // 第一个 `---` 之前的内容保持原样（不包裹）；其后（tail）各段各包裹一个 `div`。
  const firstBreak = body.findIndex((node) => node.type === 'thematicBreak');
  const head = firstBreak === -1 ? body : body.slice(0, firstBreak);
  const tail = firstBreak === -1 ? [] : body.slice(firstBreak + 1);

  const wrapped = splitByThematicBreak(tail)
    .filter((section) => section.length > 0)
    .flatMap((section) =>
      convertDirective(
        {
          type: 'containerDirective',
          name: 'div',
          attributes: { class: className },
          children: section,
        },
        mode,
      ),
    );

  return [...leading, ...esm, ...head, ...wrapped];
}

/**
 * 将 HTML 标签型 containerDirective 转换为 MDX 标签或原生 `html` 节点，
 * 并按 frontmatter 中的 `blockBreak` / `pageBreak` 配置进行分页：
 *
 * - `blockBreak: true`：对容器指令**内部**的 `---` 分页。
 * - `pageBreak: <class>`：对 root 级别（容器外部）的 `---` 分页，第一个 `---` **之前**的内容保持原样，其后每段落各包裹进 `div{.<class>}`。
 *
 * @param mode 转换模式。
 *   - `'mdx'`（默认）：转换为 `mdxJsxFlowElement`，需配合 `remark-mdx` 使用。
 *   - `'html'`：转换为原生 `html` 节点，可在纯 remark-rehype 体系（无需 MDX）下工作，
 *     此时下游 `remark-rehype` 需设置 `allowDangerousHtml: true`。
 *
 * @remarks
 * 前置依赖：管道中必须在本插件之前接入 frontmatter 解析器（如 `remark-frontmatter`），
 * 否则 AST 中不会存在 `yaml` 节点，`blockBreak` / `pageBreak` 配置将无法被读取（详情见 README）。
 */
function transform(tree: Root, mode: Mode = 'mdx'): void {
  const { blockBreak, pageBreak } = readConfig(tree);

  // 入口边界断言：将严格类型的 `RootContent[]` 收敛为内部宽松的 `MdNode[]`。
  let children = transformNodes(tree.children as MdNode[], {
    mode,
    blockBreak: blockBreak === true,
  });

  if (typeof pageBreak === 'string' && pageBreak.length > 0) {
    children = applyPageBreak(children, pageBreak, mode);
  }

  // 唯一的类型断言：手工构造/搬运的 mdast 节点结构上均为合法 `RootContent`，
  // 此处将内部宽松的 `MdNode[]` 收敛回 `RootContent[]`。
  tree.children = children as RootContent[];
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
