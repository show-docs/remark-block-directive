# remark-block-directive

Remark plugin for turning HTML directive into MDX tags.

[![npm][npm-badge]][npm-url]
[![github][github-badge]][github-url]
![node][node-badge]

[npm-url]: https://www.npmjs.com/package/remark-block-directive
[npm-badge]: https://img.shields.io/npm/v/remark-block-directive.svg?style=flat-square&logo=npm
[github-url]: git+https://github.com/show-docs/remark-block-directive
[github-badge]: https://img.shields.io/npm/l/remark-block-directive.svg?style=flat-square&colorB=blue&logo=github
[node-badge]: https://img.shields.io/node/v/remark-block-directive.svg?style=flat-square&colorB=green&logo=node.js

## Example

```md
Turn:

:::div{.foo}

bar

:::

Into:

<div class="foo">
bar
</div>
```

## Tips

Only some HTML tags are supported.

## Installation

```bash
npm install remark-block-directive --save-dev
```

## Usage

```mjs
import readFileSync from 'node:fs';

import { remark } from 'remark';
import { remarkBlockDirective } from 'remark-block-directive';
import remarkDirective from 'remark-directive';
import remarkMdx from 'remark-mdx';

const markdownText = readFileSync('example.md', 'utf8');

remark()
  .use(remarkMdx)
  .use(remarkDirective)
  .use(remarkBlockDirective)
  .process(markdownText)
  .then((file) => console.info(file))
  .catch((error) => console.warn(error));
```

## Related

- [markdown-code-block-meta](https://github.com/show-docs/markdown-code-block-meta)
- [rehype-extended-table](https://github.com/show-docs/rehype-extended-table)
- [remark-code-example](https://github.com/show-docs/remark-code-example)
- [remark-css-execute](https://github.com/show-docs/remark-css-execute)
- [remark-docusaurus](https://github.com/show-docs/remark-docusaurus)
- [remark-kroki](https://github.com/show-docs/remark-kroki)
