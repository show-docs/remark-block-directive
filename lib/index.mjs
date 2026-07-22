import YAML from 'yaml';

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
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function readConfig(tree) {
  const node = tree.children?.find((child) => child.type === 'yaml');

  if (!node) {
    return {};
  }

  try {
    return YAML.parse(node.value) ?? {};
  } catch {
    // ignore invalid yaml
    return {};
  }
}

function splitByBreak(node) {
  const parts = [[]];

  for (const child of node.children) {
    if (child.type === 'thematicBreak') {
      parts.push([]);
    } else {
      parts.at(-1).push(child);
    }
  }

  if (parts.length === 1) {
    return [node];
  }

  return parts
    .filter((part) => part.length > 0)
    .map((children) => ({ ...node, children }));
}

/**
 * 将 HTML 标签型 containerDirective 转换为 `mdxJsxFlowElement`（MDX 体系）。
 * 原地修改节点并返回单元素数组，便于与 `toHtmlFlow` 统一处理。
 */
function toMdxJsx(node) {
  node.type = 'mdxJsxFlowElement';
  node.attributes = [
    {
      type: 'mdxJsxAttribute',
      name: 'className',
      value: node.attributes?.class,
    },
    { type: 'mdxJsxAttribute', name: 'id', value: node.attributes?.id },
  ].filter(({ value }) => value !== undefined);

  return [node];
}

/**
 * 将 HTML 标签型 containerDirective 转换为一组原生 `html` 节点
 * （开标签 + 子节点 + 闭标签），以便在纯 remark-rehype 体系下无需 MDX 即可渲染。
 */
function toHtmlFlow(node) {
  const attrs = [];

  if (node.attributes?.class) {
    attrs.push(`class="${escapeHtml(node.attributes.class)}"`);
  }

  if (node.attributes?.id) {
    attrs.push(`id="${escapeHtml(node.attributes.id)}"`);
  }

  const open = `<${node.name}${attrs.length > 0 ? ` ${attrs.join(' ')}` : ''}>`;

  return [
    { type: 'html', value: open },
    ...node.children,
    { type: 'html', value: `</${node.name}>` },
  ];
}

/**
 * 递归遍历节点列表：先处理子节点，再将 HTML 标签型 `containerDirective`
 * 按 `mode` 转换为目标节点；若开启分页且标签可分页，则先按 `---` 拆分为多个容器。
 *
 * 通过单次遍历同时完成「子节点转换 → 分页拆分 → 节点转换」，
 * 替代原先 `splitTree` 与 `transformNodes` 的两次独立递归。
 */
function transformNodes(nodes, context) {
  const result = [];

  for (const node of nodes) {
    const children = node.children
      ? transformNodes(node.children, context)
      : node.children;
    const current = node.children ? { ...node, children } : node;

    if (
      node.type === 'containerDirective' &&
      convertibleTags.includes(node.name)
    ) {
      const parts =
        context.pageBreak && splittableTags.includes(node.name)
          ? splitByBreak(current)
          : [current];

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
function transform(tree, mode = 'mdx') {
  const config = readConfig(tree);

  tree.children = transformNodes(tree.children, {
    mode,
    pageBreak: config.blockBreak === true,
  });
}

export function remarkBlockDirective(options = {}) {
  const { mode = 'mdx' } = options;

  return (tree) => {
    transform(tree, mode);
  };
}
