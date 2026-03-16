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
  const sf = ts.createSourceFile('t.ts', '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
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

  it('uses operationId + "Event" as the type name', () => {
    const decl = generateEventType(makeOp());
    assert.match(printNode(decl), /ListEventsEvent/);
  });

  it('emits export modifier', () => {
    const text = printNode(generateEventType(makeOp()));
    assert.match(text, /^export type/);
  });

  it('generates a union from oneOf itemSchema', () => {
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
    const text = printNode(generateEventType(op));
    assert.match(text, /\|/);                    // union
    assert.match(text, /"ping"/);
    assert.match(text, /"pong"/);
  });

  it('includes optional id field when present in variant', () => {
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
    const text = printNode(generateEventType(op));
    assert.match(text, /id\?:/);
  });

  it('generates a plain type for flat (non-oneOf) itemSchema', () => {
    const op = makeOp({ itemSchema: { type: 'object', properties: { x: { type: 'number' } } } });
    const text = printNode(generateEventType(op));
    assert.match(text, /x\?: number/);
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
                contentSchema: { title: 'Payload', type: 'object', properties: { msg: { type: 'string' } } },
              },
            },
          },
        ],
      },
    });
    const text = printNode(generateEventType(op));
    assert.match(text, /Payload/);         // referenced by title
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
      parameters: [{ in: 'path', name: 'userId', required: true, schema: { type: 'string' } }],
    });
    const text = printNode(generateParamsType(op));
    assert.match(text, /userId: string/);
    // required → no question mark
    assert.doesNotMatch(text, /userId\?/);
  });

  it('adds optional path parameters with question mark', () => {
    const op = makeOp({
      parameters: [{ in: 'path', name: 'tag', required: false, schema: { type: 'string' } }],
    });
    const text = printNode(generateParamsType(op));
    assert.match(text, /tag\?: string/);
  });

  it('groups query params under optional query property', () => {
    const op = makeOp({
      parameters: [
        { in: 'query', name: 'limit', required: false, schema: { type: 'integer' } },
        { in: 'query', name: 'cursor', required: false, schema: { type: 'string' } },
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
            schema: { type: 'object', properties: { prompt: { type: 'string' } } },
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
    schemaRegistry.set('Foo', { type: 'object', properties: { x: { type: 'string' } } });
    schemaRegistry.set('Bar', { type: 'string' });
    const nodes = generateReferencedSchemaTypes();
    assert.equal(nodes.length, 2);
    const names = nodes.map(n => (n as ts.TypeAliasDeclaration).name.text);
    assert.ok(names.includes('Foo'));
    assert.ok(names.includes('Bar'));
  });

  it('does not cause infinite recursion for self-titled schemas', () => {
    // The schema has title set; generateReferencedSchemaTypes strips it internally
    schemaRegistry.set('Recursive', { title: 'Recursive', type: 'object', properties: {} });
    assert.doesNotThrow(() => generateReferencedSchemaTypes());
  });
});
