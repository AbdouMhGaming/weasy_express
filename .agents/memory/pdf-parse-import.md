---
name: pdf-parse import quirk
description: pdf-parse@1.1.1 index.js reads a test PDF file at module load time — use the lib directly to avoid ENOENT crash.
---

## Rule
Never do `import pdfParse from "pdf-parse"` at the top level of a server module.

Use instead:
```ts
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require("pdf-parse/lib/pdf-parse.js");
```

**Why:** `pdf-parse/index.js` (v1.1.1) calls `fs.readFileSync('./test/data/05-versions-space.pdf')` unconditionally at module load time. When this file doesn't exist (which it doesn't in the bundled dist/), the server crashes with ENOENT before it can start.

**How to apply:** In `artifacts/api-server/src/routes/office.ts`, always use the `require("pdf-parse/lib/pdf-parse.js")` form. The previous dynamic-import workaround (`await import("pdf-parse")`) caused first-call initialization failures instead.
