import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { schemaRegistry } from '../src/schema-to-ts';
import {
  toPascalCase,
  generateEventType,
  generateParamsType,
  generateReferencedSchemaTypes,
} from '../src/typegen';
import type { SseOperation } from '../src/extract';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function printNode(node: ts.Node): string {
  const sf = ts.createSourceFile(
    't.ts',
    '',
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return printer.printNode(ts.EmitHint.Unspecified, node, sf);
}

function makeOp(overrides: Partial<SseOperation> = {}): SseOperation {
  return {
    operationId: 'listEvents',
    method: 'get',
    path: '/events',
    parameters: [],
    itemSchema: { type: 'string' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// toPascalCase
// ---------------------------------------------------------------------------

describe('toPascalCase', () => {
  it('capitalises the first letter of a plain word', () => {
    assert.equal(toPascalCase('hello'), 'Hello');
  });

  it('converts kebab-case', () => {
    assert.equal(toPascalCase('foo-bar-baz'), 'FooBarBaz');
  });

  it('converts snake_case', () => {
    assert.equal(toPascalCase('foo_bar_baz'), 'FooBarBaz');
  });

  it('converts slash-separated path segments', () => {
    assert.equal(toPascalCase('get/users/list'), 'GetUsersList');
  });

  it('strips non-alphanumeric characters (only - _ / trigger capitalisation)', () => {
    // The regex upcases after [-_/] only; other punctuation is simply stripped.
    // 'my.strange!name' → strip dots/bangs → 'Mystrangename'
    assert.equal(toPascalCase('my.strange!name'), 'Mystrangename');
  });

  it('handles already-PascalCase input', () => {
    assert.equal(toPascalCase('MyModel'), 'MyModel');
  });

  it('handles camelCase input (first segment already leading upper)', () => {
    // The regex only upcases after separator chars; a plain camelCase string
    // that starts lowercase will just get its first char uppercased.
    assert.equal(toPascalCase('postChatCompletions'), 'PostChatCompletions');
  });
});

// ---------------------------------------------------------------------------
// generateEventType
// ---------------------------------------------------------------------------

describe('generateEventType', () => {
  beforeEach(() => schemaRegistry.clear());

  // Helper: print all declarations returned by generateEventType as one string.
  function printEventTypes(op: SseOperation): string {
    return generateEventType(op).map(printNode).join('\n\n');
  }

  it('uses operationId + "Event" as the union type name', () => {
    const text = printEventTypes(makeOp());
    assert.match(text, /ListEventsEvent/);
  });

  it('emits export modifier on all declarations', () => {
    const decls = generateEventType(makeOp());
    for (const d of decls) {
      assert.match(printNode(d), /^export type/);
    }
  });

  it('generates named variant types for const-string event fields', () => {
    const op = makeOp({
      itemSchema: {
        oneOf: [
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'ping' },
              data: { type: 'string' },
            },
          },
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'pong' },
              data: { type: 'string' },
            },
          },
        ],
      },
    });
    const text = printEventTypes(op);
    assert.match(text, /ListEventsPingEvent/);
    assert.match(text, /ListEventsPongEvent/);
    assert.match(text, /"ping"/);
    assert.match(text, /"pong"/);
  });

  it('union alias references named variant types by name', () => {
    const op = makeOp({
      itemSchema: {
        oneOf: [
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'ping' },
              data: { type: 'string' },
            },
          },
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'pong' },
              data: { type: 'string' },
            },
          },
        ],
      },
    });
    const decls = generateEventType(op);
    const unionDecl = decls[decls.length - 1];
    const unionText = printNode(unionDecl);
    assert.match(unionText, /ListEventsPingEvent/);
    assert.match(unionText, /ListEventsPongEvent/);
    assert.match(unionText, /\|/);
  });

  it('returns named variant + union (2 decls per const variant + 1 union)', () => {
    const op = makeOp({
      itemSchema: {
        oneOf: [
          {
            type: 'object',
            properties: { event: { type: 'string', const: 'ping' } },
          },
          {
            type: 'object',
            properties: { event: { type: 'string', const: 'pong' } },
          },
        ],
      },
    });
    // 2 named variants + 1 union = 3
    assert.equal(generateEventType(op).length, 3);
  });

  it('inlines variants without a const event string', () => {
    const op = makeOp({
      itemSchema: {
        oneOf: [
          {
            type: 'object',
            properties: { event: { type: 'string', const: 'ping' } },
          },
          { type: 'object', properties: { event: { type: 'string' } } }, // no const
        ],
      },
    });
    // 1 named variant + 1 union = 2
    assert.equal(generateEventType(op).length, 2);
    const unionText = printNode(generateEventType(op)[1]);
    assert.match(unionText, /ListEventsPingEvent/); // named ref
    assert.match(unionText, /event: string/); // inlined
  });

  it('includes optional id field in named variant type', () => {
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
    const text = printEventTypes(op);
    assert.match(text, /id\?:/);
  });

  it('generates a single alias for flat (non-oneOf) itemSchema', () => {
    const op = makeOp({
      itemSchema: { type: 'object', properties: { x: { type: 'number' } } },
    });
    assert.equal(generateEventType(op).length, 1);
    assert.match(printEventTypes(op), /x\?: number/);
  });

  it('resolves contentMediaType:application/json data to contentSchema type', () => {
    const op = makeOp({
      itemSchema: {
        oneOf: [
          {
            type: 'object',
            properties: {
              event: { type: 'string', const: 'data' },
              data: {
                type: 'string',
                contentMediaType: 'application/json',
                contentSchema: {
                  title: 'Payload',
                  type: 'object',
                  properties: { msg: { type: 'string' } },
                },
              },
            },
          },
        ],
      },
    });
    const text = printEventTypes(op);
    assert.match(text, /Payload/);
    assert.ok(schemaRegistry.has('Payload'));
  });
});

// ---------------------------------------------------------------------------
// generateParamsType
// ---------------------------------------------------------------------------

describe('generateParamsType', () => {
  beforeEach(() => schemaRegistry.clear());

  it('uses operationId + "Params" as the interface name', () => {
    const text = printNode(generateParamsType(makeOp()));
    assert.match(text, /ListEventsParams/);
  });

  it('emits export modifier', () => {
    const text = printNode(generateParamsType(makeOp()));
    assert.match(text, /^export interface/);
  });

  it('produces an empty interface when no params and no body', () => {
    const text = printNode(generateParamsType(makeOp()));
    // Just braces, no members
    assert.match(text, /\{\s*\}/);
  });

  it('adds required path parameters directly on interface', () => {
    const op = makeOp({
      parameters: [
        {
          in: 'path',
          name: 'userId',
          required: true,
          schema: { type: 'string' },
        },
      ],
    });
    const text = printNode(generateParamsType(op));
    assert.match(text, /userId: string/);
    // required → no question mark
    assert.doesNotMatch(text, /userId\?/);
  });

  it('adds optional path parameters with question mark', () => {
    const op = makeOp({
      parameters: [
        {
          in: 'path',
          name: 'tag',
          required: false,
          schema: { type: 'string' },
        },
      ],
    });
    const text = printNode(generateParamsType(op));
    assert.match(text, /tag\?: string/);
  });

  it('groups query params under optional query property', () => {
    const op = makeOp({
      parameters: [
        {
          in: 'query',
          name: 'limit',
          required: false,
          schema: { type: 'integer' },
        },
        {
          in: 'query',
          name: 'cursor',
          required: false,
          schema: { type: 'string' },
        },
      ],
    });
    const text = printNode(generateParamsType(op));
    assert.match(text, /query\?:/);
    assert.match(text, /limit\?: number/);
    assert.match(text, /cursor\?: string/);
  });

  it('adds required body property when requestBody is present', () => {
    const op = makeOp({
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { prompt: { type: 'string' } },
            },
          },
        },
      },
    });
    const text = printNode(generateParamsType(op));
    // body must be required (no ?)
    assert.match(text, /body:/);
    assert.doesNotMatch(text, /body\?:/);
  });

  it('uses unknown for body when content schema is absent', () => {
    const op = makeOp({ requestBody: {} });
    const text = printNode(generateParamsType(op));
    assert.match(text, /body: unknown/);
  });
});

// ---------------------------------------------------------------------------
// generateReferencedSchemaTypes
// ---------------------------------------------------------------------------

describe('generateReferencedSchemaTypes', () => {
  beforeEach(() => schemaRegistry.clear());

  it('returns empty array when registry is empty', () => {
    assert.deepEqual(generateReferencedSchemaTypes(), []);
  });

  it('emits one type alias per registry entry', () => {
    schemaRegistry.set('Foo', {
      type: 'object',
      properties: { x: { type: 'string' } },
    });
    schemaRegistry.set('Bar', { type: 'string' });
    const nodes = generateReferencedSchemaTypes();
    assert.equal(nodes.length, 2);
    const names = nodes.map((n) => (n as ts.TypeAliasDeclaration).name.text);
    assert.ok(names.includes('Foo'));
    assert.ok(names.includes('Bar'));
  });

  it('does not cause infinite recursion for self-titled schemas', () => {
    // The schema has title set; generateReferencedSchemaTypes strips it internally
    schemaRegistry.set('Recursive', {
      title: 'Recursive',
      type: 'object',
      properties: {},
    });
    assert.doesNotThrow(() => generateReferencedSchemaTypes());
  });
});
