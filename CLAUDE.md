# CLAUDE.md

## Important: Keep README examples in sync

The README.md contains generated output examples (types.ts, client.ts snippets) that must stay accurate as code generation evolves. Whenever the shape of generated code changes — new fields, different formatting, structural changes to the dispatch logic, etc. — regenerate the sample and update the corresponding README sections.

To regenerate the sample output:
```bash
npm run build
node dist/cli.js --input openapi.yaml --output /tmp/sse-verify
```

Then update the relevant code blocks in README.md under "Generated output".

## Project overview

TypeScript CLI that reads an OpenAPI spec and generates typed `AsyncGenerator` wrappers for SSE endpoints. See README for the full design.

Key source files:
- `src/extract.ts` — finds `text/event-stream` + `itemSchema` operations
- `src/schema-to-ts.ts` — JSON Schema → `ts.TypeNode` (populates `schemaRegistry`)
- `src/typegen.ts` — `itemSchema` → discriminated union type alias + params interface
- `src/fngen.ts` — operation → `async function*` declaration with onmessage dispatch
- `src/emit.ts` — TypeScript printer → string; writes output files

## Testing

```bash
npm test   # runs tsc + node --test on dist-test/**/*.test.js
```

116 tests via Node's built-in test runner (`node:test`). No additional test framework.
