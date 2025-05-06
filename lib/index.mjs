import { visit } from 'unist-util-visit';

const tags = [
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

export function remarkBlockDirective() {
  return (tree) => {
    visit(
      tree,
      (node) => node.type === 'containerDirective' && tags.includes(node.name),
      (node) => {
        node.type = 'mdxJsxFlowElement';
        node.attributes = [
          {
            type: 'mdxJsxAttribute',
            name: 'className',
            value: node.attributes?.class,
          },
          {
            type: 'mdxJsxAttribute',
            name: 'id',
            value: node.attributes?.id,
          },
        ].filter(({ value }) => value !== undefined);
      },
    );
  };
}
