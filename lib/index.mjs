import YAML from 'yaml';
import { visit } from 'unist-util-visit';

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

function splitTree(nodes, pageBreak) {
  const result = [];

  for (const node of nodes) {
    const children = node.children
      ? splitTree(node.children, pageBreak)
      : node.children;
    const transformed = node.children ? { ...node, children } : node;

    if (
      pageBreak &&
      node.type === 'containerDirective' &&
      splittableTags.includes(node.name)
    ) {
      result.push(...splitByBreak(transformed));
    } else {
      result.push(transformed);
    }
  }

  return result;
}

/**
 * 将 HTML 标签型 containerDirective 转换为 `mdxJsxFlowElement`，
 * 并按 frontmatter 中的 `blockBreak` 配置对容器按 `---` 分割线分页。
 *
 * @remarks
 * 前置依赖：管道中必须在本插件之前接入 frontmatter 解析器（如 `remark-frontmatter`），
 * 否则 AST 中不会存在 `yaml` 节点，`blockBreak` 配置将无法被读取（详情见 README）。
 */
function transform(tree) {
  const config = readConfig(tree);

  if (config.blockBreak === true) {
    tree.children = splitTree(tree.children, true);
  }

  visit(
    tree,
    (node) =>
      node.type === 'containerDirective' && convertibleTags.includes(node.name),
    (node) => {
      node.type = 'mdxJsxFlowElement';
      node.attributes = [
        {
          type: 'mdxJsxAttribute',
          name: 'className',
          value: node.attributes?.class,
        },
        { type: 'mdxJsxAttribute', name: 'id', value: node.attributes?.id },
      ].filter(({ value }) => value !== undefined);
    },
  );
}

export function remarkBlockDirective() {
  return transform;
}
