import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { emitToString, writeFiles } from '../src/emit';

// ---------------------------------------------------------------------------
// emitToString
// ---------------------------------------------------------------------------

describe('emitToString', () => {
  it('returns an empty string for an empty node list', () => {
    assert.equal(emitToString([]), '');
  });

  it('prints a single type alias declaration', () => {
    const node = ts.factory.createTypeAliasDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      'Foo',
      undefined,
      ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
    );
    const result = emitToString([node]);
    assert.match(result, /export type Foo = string/);
  });

  it('joins multiple nodes with double newline', () => {
    const makeAlias = (name: string) =>
      ts.factory.createTypeAliasDeclaration(
        undefined,
        name,
        undefined,
        ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword)
      );
    const result = emitToString([makeAlias('A'), makeAlias('B')]);
    assert.match(result, /type A/);
    assert.match(result, /type B/);
    // They should be separated by a blank line
    assert.match(result, /type A[\s\S]+\n\ntype B/);
  });

  it('prints an interface declaration', () => {
    const iface = ts.factory.createInterfaceDeclaration(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      'Bar',
      undefined,
      undefined,
      [
        ts.factory.createPropertySignature(
          undefined,
          'id',
          undefined,
          ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
        ),
      ]
    );
    const result = emitToString([iface]);
    assert.match(result, /export interface Bar/);
    assert.match(result, /id: string/);
  });
});

// ---------------------------------------------------------------------------
// writeFiles
// ---------------------------------------------------------------------------

describe('writeFiles', () => {
  it('creates the output directory if it does not exist', () => {
    const dir = path.join(os.tmpdir(), `sse-test-${Date.now()}`);
    writeFiles(dir, { 'a.ts': '// hello' });
    assert.ok(fs.existsSync(dir));
    fs.rmSync(dir, { recursive: true });
  });

  it('writes each file with the correct content', () => {
    const dir = path.join(os.tmpdir(), `sse-test-${Date.now()}`);
    writeFiles(dir, {
      'foo.ts': 'export const x = 1;',
      'bar.ts': 'export const y = 2;',
    });
    assert.equal(fs.readFileSync(path.join(dir, 'foo.ts'), 'utf-8'), 'export const x = 1;');
    assert.equal(fs.readFileSync(path.join(dir, 'bar.ts'), 'utf-8'), 'export const y = 2;');
    fs.rmSync(dir, { recursive: true });
  });

  it('overwrites an existing file', () => {
    const dir = path.join(os.tmpdir(), `sse-test-${Date.now()}`);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'x.ts'), 'old content');
    writeFiles(dir, { 'x.ts': 'new content' });
    assert.equal(fs.readFileSync(path.join(dir, 'x.ts'), 'utf-8'), 'new content');
    fs.rmSync(dir, { recursive: true });
  });

  it('handles nested directories via recursive mkdir', () => {
    const dir = path.join(os.tmpdir(), `sse-test-${Date.now()}`, 'deep', 'nested');
    writeFiles(dir, { 'out.ts': '// ok' });
    assert.ok(fs.existsSync(path.join(dir, 'out.ts')));
    fs.rmSync(path.join(os.tmpdir(), path.basename(path.dirname(path.dirname(dir)))), { recursive: true });
  });
});
