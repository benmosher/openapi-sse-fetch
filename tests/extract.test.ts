import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractSseOperations } from '../src/extract';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpec(overrides: object = {}) {
  return {
    paths: {
      '/stream': {
        get: {
          operationId: 'streamData',
          parameters: [],
          responses: {
            '200': {
              content: {
                'text/event-stream': {
                  schema: {
                    type: 'object',
                    itemSchema: { type: 'string' },
                  },
                },
              },
            },
          },
          ...overrides,
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// extractSseOperations
// ---------------------------------------------------------------------------

describe('extractSseOperations', () => {
  it('returns an empty array when spec has no paths', () => {
    const result = extractSseOperations({});
    assert.deepEqual(result, []);
  });

  it('returns an empty array when no text/event-stream responses exist', () => {
    const spec = {
      paths: {
        '/json': {
          get: {
            operationId: 'getJson',
            parameters: [],
            responses: {
              '200': { content: { 'application/json': { schema: { type: 'object' } } } },
            },
          },
        },
      },
    };
    assert.deepEqual(extractSseOperations(spec), []);
  });

  it('returns an empty array when text/event-stream response lacks itemSchema', () => {
    const spec = {
      paths: {
        '/stream': {
          get: {
            operationId: 'noItems',
            parameters: [],
            responses: {
              '200': {
                content: {
                  'text/event-stream': { schema: { type: 'object' } }, // no itemSchema
                },
              },
            },
          },
        },
      },
    };
    assert.deepEqual(extractSseOperations(spec), []);
  });

  it('extracts a basic SSE operation', () => {
    const ops = extractSseOperations(makeSpec());
    assert.equal(ops.length, 1);
    assert.equal(ops[0].operationId, 'streamData');
    assert.equal(ops[0].method, 'get');
    assert.equal(ops[0].path, '/stream');
    assert.deepEqual(ops[0].itemSchema, { type: 'string' });
    assert.deepEqual(ops[0].parameters, []);
    assert.equal(ops[0].requestBody, undefined);
  });

  it('extracts a FastAPI-format SSE operation (itemSchema directly on content, no schema wrapper)', () => {
    const spec = {
      paths: {
        '/stream': {
          get: {
            operationId: 'fastApiStream',
            parameters: [],
            responses: {
              '200': {
                content: {
                  'text/event-stream': {
                    itemSchema: { type: 'object', properties: { data: { type: 'string' } } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const ops = extractSseOperations(spec);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].operationId, 'fastApiStream');
    assert.deepEqual(ops[0].itemSchema, { type: 'object', properties: { data: { type: 'string' } } });
  });

  it('synthesises an operationId when none is given', () => {
    const spec = {
      paths: {
        '/my/path': {
          post: {
            parameters: [],
            responses: {
              '200': {
                content: {
                  'text/event-stream': {
                    schema: { type: 'object', itemSchema: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const ops = extractSseOperations(spec);
    assert.equal(ops.length, 1);
    // operationId should include method + sanitised path
    assert.match(ops[0].operationId, /post/i);
  });

  it('captures requestBody when present', () => {
    const rb = { content: { 'application/json': { schema: { type: 'object' } } } };
    const ops = extractSseOperations(makeSpec({ requestBody: rb }));
    assert.deepEqual(ops[0].requestBody, rb);
  });

  it('captures parameters array', () => {
    const params = [{ in: 'query', name: 'limit', schema: { type: 'integer' } }];
    const ops = extractSseOperations(makeSpec({ parameters: params }));
    assert.deepEqual(ops[0].parameters, params);
  });

  it('extracts multiple operations across different paths and methods', () => {
    const spec = {
      paths: {
        '/a': {
          get: {
            operationId: 'opA',
            parameters: [],
            responses: {
              '200': {
                content: { 'text/event-stream': { schema: { type: 'object', itemSchema: { type: 'string' } } } },
              },
            },
          },
        },
        '/b': {
          post: {
            operationId: 'opB',
            parameters: [],
            responses: {
              '200': {
                content: { 'text/event-stream': { schema: { type: 'object', itemSchema: { type: 'number' } } } },
              },
            },
          },
        },
      },
    };
    const ops = extractSseOperations(spec);
    assert.equal(ops.length, 2);
    assert.deepEqual(ops.map(o => o.operationId).sort(), ['opA', 'opB']);
  });

  it('ignores non-SSE methods on a path that also has an SSE method', () => {
    const spec = {
      paths: {
        '/mixed': {
          get: {
            operationId: 'sseOp',
            parameters: [],
            responses: {
              '200': {
                content: { 'text/event-stream': { schema: { type: 'object', itemSchema: { type: 'string' } } } },
              },
            },
          },
          post: {
            operationId: 'jsonOp',
            parameters: [],
            responses: {
              '200': { content: { 'application/json': { schema: { type: 'object' } } } },
            },
          },
        },
      },
    };
    const ops = extractSseOperations(spec);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].operationId, 'sseOp');
  });
});
