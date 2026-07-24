# remark-block-directive

Remark plugin for turning HTML directive into MDX tags.

[![npm][npm-badge]][npm-url]
[![github][github-badge]][github-url]
![node][node-badge]

[npm-url]: https://www.npmjs.com/package/remark-block-directive
[npm-badge]: https://img.shields.io/npm/v/remark-block-directive.svg?style=flat-square&logo=npm
[github-url]: https://github.com/show-docs/remark-block-directive
[github-badge]: https://img.shields.io/npm/l/remark-block-directive.svg?style=flat-square&colorB=blue&logo=github
[node-badge]: https://img.shields.io/node/v/remark-block-directive.svg?style=flat-square&colorB=green&logo=node.js

## Example

Turn:

```md
---
blockBreak: true
---

::::div{.abc}

xyz

:::p

foo

---

bar

:::

::::
```

Into:

```html
<div class="abc">
  xyz
  <p>foo</p>
  <p>bar</p>
</div>
```

## Page Break

`pageBreak` 将 **root 级别**（容器指令外部）的 `---` 分割线作为分页依据，
把每段内容包裹进 `div{.<class>}`（类名即 `pageBreak` 的取值，如 `a4`）。

```md
---
pageBreak: a4
---

A

---

B
```

转为：

```html
<div class="a4">A</div>

<div class="a4">B</div>
```

`pageBreak` 与 `blockBreak` 相互独立、可并存：

- `blockBreak: true` 作用于**容器指令内部**的 `---`。
- `pageBreak: <class>` 作用于 **root 级别**（容器外部）的 `---`。

```md
---
blockBreak: true
pageBreak: a4
---

:::div

A

---

B

::::

---

X
```

`:::div` 内部按 `blockBreak` 拆成两个 `div`，root 级别的 `---` 再按 `pageBreak`
将整体拆成两个 `div.a4`。

> 仅当文档中存在 root 级 `---` 时才包裹，重复处理结果为幂等（分割线在首次处理即被消耗）。

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
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdx from 'remark-mdx';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';

const markdownText = readFileSync('example.md', 'utf8');

// MDX mode
remark()
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkMdx)
  .use(remarkDirective)
  .use(remarkBlockDirective, { mode: 'mdx' })
  .process(markdownText)
  .then((file) => console.info(file))
  .catch((error) => console.warn(error));

// HTML mode
remark()
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkDirective)
  .use(remarkBlockDirective, { mode: 'html' })
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeStringify)
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
