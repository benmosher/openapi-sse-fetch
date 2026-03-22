import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateFunction } from '../src/fngen';
import type { SseOperation } from '../src/extract';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOp(overrides: Partial<SseOperation> = {}): SseOperation {
  return {
    operationId: 'streamFeed',
    method: 'get',
    path: '/feed',
    parameters: [],
    itemSchema: { type: 'string' },
    ...overrides,
  };
}

const BASE = 'https://api.example.com/v1';

// ---------------------------------------------------------------------------
// generateFunction
// ---------------------------------------------------------------------------

describe('generateFunction', () => {
  it('exports an async generator function', () => {
    const code = generateFunction(makeOp(), BASE);
    assert.match(code, /^export async function\*/);
  });

  it('uses a camelCase function name from operationId', () => {
    const code = generateFunction(
      makeOp({ operationId: 'PostChatCompletions' }),
      BASE,
    );
    assert.match(code, /function\* postChatCompletions/);
  });

  it('returns AsyncGenerator typed to the Event type', () => {
    const code = generateFunction(makeOp({ operationId: 'streamFeed' }), BASE);
    assert.match(code, /AsyncGenerator<StreamFeedEvent>/);
  });

  it('includes params typed to the Params interface', () => {
    const code = generateFunction(makeOp({ operationId: 'streamFeed' }), BASE);
    assert.match(code, /StreamFeedParams/);
  });

  it('includes optional options parameter with signal and headers', () => {
    const code = generateFunction(makeOp(), BASE);
    assert.match(code, /options\?.*AbortSignal/);
    assert.match(code, /Record<string, string>/);
  });

  it('generates a function body that references BASE_URL (caller injects the base URL)', () => {
    // The base URL is emitted as the `const BASE_URL = ...` line in the file
    // header by index.ts; the function body always references `${BASE_URL}/...`.
    // We verify the template-literal reference is present in the function body.
    const code = generateFunction(makeOp(), 'https://custom.example.com');
    assert.match(code, /\$\{BASE_URL\}/);
  });

  it('interpolates simple path without path params as a template literal', () => {
    const code = generateFunction(makeOp({ path: '/feed' }), BASE);
    assert.match(code, /\$\{BASE_URL\}\/feed/);
  });

  it('interpolates path parameters into the URL', () => {
    const op = makeOp({
      path: '/users/{userId}/items/{itemId}',
      parameters: [
        {
          in: 'path',
          name: 'userId',
          required: true,
          schema: { type: 'string' },
        },
        {
          in: 'path',
          name: 'itemId',
          required: true,
          schema: { type: 'string' },
        },
      ],
    });
    const code = generateFunction(op, BASE);
    assert.match(code, /\$\{params\.userId\}/);
    assert.match(code, /\$\{params\.itemId\}/);
  });

  it('builds a URLSearchParams-style URL when query params are present', () => {
    const op = makeOp({
      parameters: [
        {
          in: 'query',
          name: 'limit',
          required: false,
          schema: { type: 'integer' },
        },
      ],
    });
    const code = generateFunction(op, BASE);
    assert.match(code, /new URL/);
    assert.match(code, /searchParams\.set/);
  });

  it('uses GET method for GET operations', () => {
    const code = generateFunction(makeOp({ method: 'get' }), BASE);
    assert.match(code, /method: 'GET'/);
  });

  it('uses POST method for POST operations', () => {
    const code = generateFunction(makeOp({ method: 'post' }), BASE);
    assert.match(code, /method: 'POST'/);
  });

  it('includes Content-Type and body serialisation for operations with a requestBody', () => {
    const op = makeOp({
      method: 'post',
      requestBody: {
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    });
    const code = generateFunction(op, BASE);
    assert.match(code, /Content-Type.*application\/json/);
    assert.match(code, /JSON\.stringify\(params\.body\)/);
  });

  it('omits body serialisation for operations without requestBody', () => {
    const code = generateFunction(makeOp({ method: 'get' }), BASE);
    assert.doesNotMatch(code, /JSON\.stringify\(params\.body\)/);
    assert.doesNotMatch(code, /Content-Type/);
  });

  it('passes signal from options to fetchEventSource', () => {
    const code = generateFunction(makeOp(), BASE);
    assert.match(code, /signal: options\?\.signal/);
  });

  it('generates oneOf dispatch with event-name checks', () => {
    const op = makeOp({
      itemSchema: {
        oneOf: [
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'start' },
              data: { type: 'string' },
            },
          },
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'end' },
              data: { type: 'string' },
            },
          },
        ],
      },
    });
    const code = generateFunction(op, BASE);
    assert.match(code, /msg\.event === "start"/);
    assert.match(code, /msg\.event === "end"/);
  });

  it('casts to union type when oneOf has no event discriminator', () => {
    const op = makeOp({
      itemSchema: {
        oneOf: [
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'start' },
              data: { type: 'string' },
            },
          },
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'end' },
              data: { type: 'string' },
            },
          },
        ],
        // no discriminator
      },
    });
    const code = generateFunction(op, BASE);
    assert.match(code, /as StreamFeedEvent/);
    assert.doesNotMatch(code, /as StreamFeedStartEvent/);
    assert.doesNotMatch(code, /as StreamFeedEndEvent/);
  });

  it('casts to per-variant types when oneOf has discriminator propertyName "event"', () => {
    const op = makeOp({
      itemSchema: {
        oneOf: [
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'start' },
              data: { type: 'string' },
            },
          },
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'end' },
              data: { type: 'string' },
            },
          },
        ],
        discriminator: { propertyName: 'event' },
      },
    });
    const code = generateFunction(op, BASE);
    assert.match(code, /as StreamFeedStartEvent/);
    assert.match(code, /as StreamFeedEndEvent/);
    assert.doesNotMatch(code, /as StreamFeedEvent\b/);
  });

  it('JSON.parses data when contentMediaType is application/json', () => {
    const op = makeOp({
      itemSchema: {
        oneOf: [
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'chunk' },
              data: {
                type: 'string',
                contentMediaType: 'application/json',
                contentSchema: { type: 'object' },
              },
            },
          },
        ],
      },
    });
    const code = generateFunction(op, BASE);
    assert.match(code, /JSON\.parse\(msg\.data\)/);
  });

  it('passes msg.data directly when data has no contentMediaType', () => {
    const op = makeOp({
      itemSchema: {
        oneOf: [
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'text' },
              data: { type: 'string' }, // no contentMediaType
            },
          },
        ],
      },
    });
    const code = generateFunction(op, BASE);
    // The data expression for this variant should be plain msg.data, not JSON.parse
    assert.match(code, /data: msg\.data/);
  });

  it('pushes id field when variant has id property', () => {
    const op = makeOp({
      itemSchema: {
        oneOf: [
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'msg' },
              data: { type: 'string' },
              id: { type: 'string' },
            },
          },
        ],
      },
    });
    const code = generateFunction(op, BASE);
    assert.match(code, /id: msg\.id/);
  });

  it('falls back to JSON.parse for flat non-primitive itemSchema', () => {
    const op = makeOp({
      itemSchema: { type: 'object', properties: { x: { type: 'string' } } },
    });
    const code = generateFunction(op, BASE);
    assert.match(code, /JSON\.parse\(msg\.data\)/);
  });

  it('uses raw msg.data for flat primitive (string) itemSchema', () => {
    const code = generateFunction(
      makeOp({ itemSchema: { type: 'string' } }),
      BASE,
    );
    assert.match(code, /msg\.data as unknown as/);
    assert.doesNotMatch(code, /JSON\.parse/);
  });

  it('calls ch.done() in onclose', () => {
    const code = generateFunction(makeOp(), BASE);
    assert.match(code, /onclose\(\).*ch\.done\(\)/);
  });

  it('calls ch.error() and rethrows in onerror', () => {
    const code = generateFunction(makeOp(), BASE);
    assert.match(code, /onerror\(err\).*ch\.error\(err\)/s);
    assert.match(code, /throw err/);
  });

  it('yields from ch.iter()', () => {
    const code = generateFunction(makeOp(), BASE);
    assert.match(code, /yield\* ch\.iter\(\)/);
  });

  it('uses default empty params when no params or body are needed', () => {
    // operationId with no parameters and no requestBody
    const code = generateFunction(makeOp({ parameters: [] }), BASE);
    // Should fall back to default value assignment
    assert.match(code, /= \{\} as StreamFeedParams/);
  });

  it('constructs wrapper object for flat schema with event:string + JSON data + id', () => {
    const op = makeOp({
      itemSchema: {
        type: 'object',
        properties: {
          event: { type: 'string' },
          data: {
            type: 'string',
            contentMediaType: 'application/json',
            contentSchema: { type: 'object' },
          },
          id: { type: 'string' },
        },
      },
    });
    const code = generateFunction(op, BASE);
    assert.match(code, /event: msg\.event/);
    assert.match(code, /data: JSON\.parse\(msg\.data\)/);
    assert.match(code, /id: msg\.id/);
    // Should not do a bare JSON.parse push
    assert.doesNotMatch(code, /ch\.push\(JSON\.parse/);
  });

  it('constructs wrapper object with raw data when no contentMediaType', () => {
    const op = makeOp({
      itemSchema: {
        type: 'object',
        properties: {
          event: { type: 'string' },
          data: { type: 'string' },
          id: { type: 'string' },
        },
      },
    });
    const code = generateFunction(op, BASE);
    assert.match(code, /event: msg\.event/);
    assert.match(code, /data: msg\.data/);
    assert.doesNotMatch(code, /JSON\.parse/);
  });

  it('omits id field from wrapper when not in schema', () => {
    const op = makeOp({
      itemSchema: {
        type: 'object',
        properties: {
          event: { type: 'string' },
          data: {
            type: 'string',
            contentMediaType: 'application/json',
            contentSchema: { type: 'object' },
          },
        },
      },
    });
    const code = generateFunction(op, BASE);
    assert.match(code, /event: msg\.event/);
    assert.doesNotMatch(code, /id: msg\.id/);
  });

  it('does not treat flat object without event property as wrapper', () => {
    const op = makeOp({
      itemSchema: { type: 'object', properties: { x: { type: 'string' } } },
    });
    const code = generateFunction(op, BASE);
    // Falls through to bare JSON.parse
    assert.match(code, /ch\.push\(JSON\.parse\(msg\.data\)/);
    assert.doesNotMatch(code, /event: msg\.event/);
  });
});
