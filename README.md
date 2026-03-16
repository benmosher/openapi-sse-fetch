# openapi-sse-fetch

TypeScript code generator for OpenAPI SSE endpoints. Reads an OpenAPI 3.1/3.2 spec, finds `text/event-stream` operations annotated with `itemSchema`, and generates typed `AsyncGenerator` wrapper functions backed by [`@microsoft/fetch-event-source`](https://github.com/Azure/fetch-event-source).

Follows the [bump.sh OpenAPI 3.2 streaming pattern](https://bump.sh/blog/json-streaming-openapi-3-2/): `itemSchema` describes each SSE event, and fields annotated with `contentMediaType: application/json` + `contentSchema` are JSON-parsed at runtime and typed with their `contentSchema` type rather than `string`.

---

## Installation

```bash
npm install -g openapi-sse-fetch
```

Or use directly with npx:

```bash
npx openapi-sse-fetch --input ./openapi.yaml --output ./generated
```

---

## Usage

```
sse-codegen --input <path>  --output <dir>  [--base-url <url>]
```

| Option | Description | Default |
|---|---|---|
| `--input` | Path to OpenAPI spec (YAML or JSON) | required |
| `--output` | Output directory (created if needed) | `./generated` |
| `--base-url` | Base URL override | First `servers[].url` in spec |

---

## OpenAPI spec annotation

Mark a response as an SSE stream using `content: text/event-stream` with an `itemSchema` on the response schema. Use `oneOf` for multi-event streams with a discriminant `const` on the `event` field. Use `contentMediaType: application/json` + `contentSchema` to describe JSON-encoded `data` fields:

```yaml
paths:
  /chat/completions:
    post:
      operationId: postChatCompletions
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChatCompletionRequest'
      responses:
        '200':
          description: SSE stream
          content:
            text/event-stream:
              schema:
                type: object
                itemSchema:
                  oneOf:
                    - type: object
                      properties:
                        event:
                          type: string
                          const: message
                        data:
                          type: string
                          contentMediaType: application/json
                          contentSchema:
                            $ref: '#/components/schemas/ChatMessage'
                        id:
                          type: string
                    - type: object
                      properties:
                        event:
                          type: string
                          const: done
                        data:
                          type: string
                    - type: object
                      properties:
                        event:
                          type: string
                          const: error
                        data:
                          type: string
                          contentMediaType: application/json
                          contentSchema:
                            $ref: '#/components/schemas/ApiError'
                        id:
                          type: string
```

---

## Generated output

Running `sse-codegen --input openapi.yaml --output ./generated` produces three files:

### `generated/types.ts`

Named schemas from `$ref` components and per-operation params/event unions:

```typescript
export type ChatCompletionRequest = {
    messages: Message[];
    stream?: boolean;
};

export type ChatMessage = {
    content: string;
    role?: string;
    finish_reason?: string;
};

export type ApiError = {
    code: string;
    message: string;
};

export interface PostChatCompletionsParams {
    body: ChatCompletionRequest;
}

export type PostChatCompletionsEvent = {
    event: "message";
    data: ChatMessage;  // JSON-parsed from msg.data
    id?: string;
} | {
    event: "done";
    data: string;
} | {
    event: "error";
    data: ApiError;    // JSON-parsed from msg.data
    id?: string;
};
```

### `generated/client.ts`

Typed `async function*` wrappers — one per SSE operation:

```typescript
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { createChannel } from './_helpers';
import type { PostChatCompletionsParams, PostChatCompletionsEvent } from './types';

const BASE_URL = "https://api.example.com/v1";

export async function* postChatCompletions(
  params: PostChatCompletionsParams,
  options?: { signal?: AbortSignal; headers?: HeadersInit }
): AsyncGenerator<PostChatCompletionsEvent> {
  const ch = createChannel<PostChatCompletionsEvent>();
  const _url = `${BASE_URL}/chat/completions`;

  fetchEventSource(_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(params.body),
    signal: options?.signal,
    async onopen(res) {
      if (!res.ok) throw new Error(`SSE open failed: ${res.status}`);
    },
    onmessage(msg) {
      if (msg.event === "message") {
        ch.push({ event: "message", data: JSON.parse(msg.data), id: msg.id } as PostChatCompletionsEvent);
        return;
      }
      if (msg.event === "done") {
        ch.push({ event: "done", data: msg.data } as PostChatCompletionsEvent);
        return;
      }
      if (msg.event === "error") {
        ch.push({ event: "error", data: JSON.parse(msg.data), id: msg.id } as PostChatCompletionsEvent);
        return;
      }
    },
    onclose() { ch.done(); },
    onerror(err) { ch.error(err); throw err; },
  }).catch((err: unknown) => ch.error(err));

  yield* ch.iter();
}
```

### `generated/_helpers.ts`

A static channel helper (callbacks → AsyncGenerator bridge), copied verbatim:

```typescript
export function createChannel<T>() { ... }
```

---

## Consuming the generated client

Install the peer dependency in your project:

```bash
npm install @microsoft/fetch-event-source
```

Then use the generated function as an async iterator:

```typescript
import { postChatCompletions } from './generated/client';

const stream = postChatCompletions({
  body: {
    messages: [{ role: 'user', content: 'Hello!' }],
  },
});

for await (const event of stream) {
  if (event.event === 'message') {
    process.stdout.write(event.data.content);  // typed as ChatMessage
  } else if (event.event === 'done') {
    console.log('\nDone');
  } else if (event.event === 'error') {
    console.error(event.data.message);  // typed as ApiError
  }
}
```

Cancellation via `AbortSignal`:

```typescript
const controller = new AbortController();

for await (const event of postChatCompletions({ body: { messages } }, { signal: controller.signal })) {
  if (shouldStop) controller.abort();
  // ...
}
```

---

## How it works

1. **Parse** — loads and dereferences the spec using `@scalar/openapi-parser`
2. **Extract** — finds all operations with `responses[*].content['text/event-stream'].schema.itemSchema`
3. **Type generation** — converts `itemSchema.oneOf` variants into a discriminated union; schemas referenced via `$ref` (resolved by title) become named type aliases
4. **Function generation** — emits an `async function*` per operation with per-variant `onmessage` dispatch, path/query parameter handling, and request body serialization
5. **Emit** — uses the TypeScript compiler API (`ts.createPrinter`) to format output

---

## Development

```bash
npm install
npm run build
npm test        # 116 tests via Node built-in test runner
```
