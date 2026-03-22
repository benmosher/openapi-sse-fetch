import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { schemaToTs, schemaRegistry } from '../src/schema-to-ts';

// ---------------------------------------------------------------------------
// Helper: print a TypeNode to a string for readable assertions
// ---------------------------------------------------------------------------

function printType(node: ts.TypeNode): string {
  const sf = ts.createSourceFile('t.ts', '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const printer = ts.createPrinter();
  return printer.printNode(ts.EmitHint.Unspecified, node, sf);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('schemaToTs', () => {
  beforeEach(() => {
    schemaRegistry.clear();
  });

  it('returns unknown for null/undefined schema', () => {
    assert.equal(printType(schemaToTs(null)), 'unknown');
    assert.equal(printType(schemaToTs(undefined)), 'unknown');
  });

  it('maps type:string to string keyword', () => {
    assert.equal(printType(schemaToTs({ type: 'string' })), 'string');
  });

  it('maps type:integer to number keyword', () => {
    assert.equal(printType(schemaToTs({ type: 'integer' })), 'number');
  });

  it('maps type:number to number keyword', () => {
    assert.equal(printType(schemaToTs({ type: 'number' })), 'number');
  });

  it('maps type:boolean to boolean keyword', () => {
    assert.equal(printType(schemaToTs({ type: 'boolean' })), 'boolean');
  });

  it('maps type:null to null literal', () => {
    assert.equal(printType(schemaToTs({ type: 'null' })), 'null');
  });

  it('maps type:array with items', () => {
    assert.equal(printType(schemaToTs({ type: 'array', items: { type: 'string' } })), 'string[]');
  });

  it('maps type:array without items to unknown[]', () => {
    assert.equal(printType(schemaToTs({ type: 'array' })), 'unknown[]');
  });

  it('maps type:object with properties', () => {
    const result = printType(schemaToTs({
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        count: { type: 'integer' },
      },
    }));
    assert.match(result, /id: string/);
    assert.match(result, /count\?: number/);
  });

  it('handles schema with only properties (no explicit type)', () => {
    const result = printType(schemaToTs({
      properties: { name: { type: 'string' } },
    }));
    assert.match(result, /name\?: string/);
  });

  it('generates a string const literal', () => {
    assert.equal(printType(schemaToTs({ const: 'hello' })), '"hello"');
  });

  it('generates a numeric const literal', () => {
    assert.equal(printType(schemaToTs({ const: 42 })), '42');
  });

  it('generates a boolean true literal', () => {
    assert.equal(printType(schemaToTs({ const: true })), 'true');
  });

  it('generates a boolean false literal', () => {
    assert.equal(printType(schemaToTs({ const: false })), 'false');
  });

  it('maps oneOf to a union type', () => {
    const result = printType(schemaToTs({
      oneOf: [{ type: 'string' }, { type: 'number' }],
    }));
    assert.equal(result, 'string | number');
  });

  it('maps allOf to an intersection type', () => {
    const result = printType(schemaToTs({
      allOf: [
        { properties: { a: { type: 'string' } } },
        { properties: { b: { type: 'number' } } },
      ],
    }));
    assert.match(result, /&/);
  });

  it('registers a titled object schema in schemaRegistry and returns a reference', () => {
    const schema = { title: 'MyModel', type: 'object', properties: { x: { type: 'string' } } };
    const result = printType(schemaToTs(schema));
    assert.equal(result, 'MyModel');
    assert.ok(schemaRegistry.has('MyModel'));
    assert.equal(schemaRegistry.get('MyModel'), schema);
  });

  it('does not register titled primitive schemas as named types', () => {
    assert.equal(printType(schemaToTs({ title: 'MyString', type: 'string' })), 'string');
    assert.equal(printType(schemaToTs({ title: 'MyInt', type: 'integer' })), 'number');
    assert.equal(printType(schemaToTs({ title: 'MyNum', type: 'number' })), 'number');
    assert.equal(printType(schemaToTs({ title: 'MyBool', type: 'boolean' })), 'boolean');
    assert.equal(printType(schemaToTs({ title: 'MyNull', type: 'null' })), 'null');
    assert.ok(!schemaRegistry.has('MyString'));
    assert.ok(!schemaRegistry.has('MyInt'));
    assert.ok(!schemaRegistry.has('MyNum'));
    assert.ok(!schemaRegistry.has('MyBool'));
    assert.ok(!schemaRegistry.has('MyNull'));
  });

  it('handles contentMediaType:application/json by unwrapping contentSchema', () => {
    const result = printType(schemaToTs({
      contentMediaType: 'application/json',
      contentSchema: { type: 'boolean' },
    }));
    assert.equal(result, 'boolean');
  });

  it('returns unknown for application/json without contentSchema', () => {
    assert.equal(
      printType(schemaToTs({ contentMediaType: 'application/json' })),
      'unknown'
    );
  });

  it('uses first element when type is an array', () => {
    assert.equal(printType(schemaToTs({ type: ['string', 'null'] })), 'string');
  });

  it('falls back to unknown for unrecognised schema', () => {
    assert.equal(printType(schemaToTs({ format: 'date' })), 'unknown');
  });

  it('maps a string enum to a union of string literals', () => {
    assert.equal(printType(schemaToTs({ type: 'string', enum: ['ONLINE', 'OFFLINE'] })), '"ONLINE" | "OFFLINE"');
  });

  it('maps a single-element enum to a single literal (not a union)', () => {
    assert.equal(printType(schemaToTs({ type: 'string', enum: ['ACTIVE'] })), '"ACTIVE"');
  });

  it('maps a number enum to a union of numeric literals', () => {
    assert.equal(printType(schemaToTs({ type: 'integer', enum: [1, 2, 3] })), '1 | 2 | 3');
  });

  it('maps a mixed enum to a union of literals', () => {
    const result = printType(schemaToTs({ enum: ['a', 1, true, null] }));
    assert.equal(result, '"a" | 1 | true | null');
  });

  it('handles enum inside an object property', () => {
    const result = printType(schemaToTs({
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['ONLINE', 'OFFLINE'] },
      },
    }));
    assert.match(result, /status: "ONLINE" \| "OFFLINE"/);
  });
});
