import ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

export function emitToString(nodes: ts.Node[]): string {
  const resultFile = ts.createSourceFile(
    'output.ts',
    '',
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  const parts = nodes.map(node =>
    printer.printNode(ts.EmitHint.Unspecified, node, resultFile)
  );
  return parts.join('\n\n');
}

export function writeFiles(outputDir: string, files: Record<string, string>): void {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(outputDir, filename), content, 'utf-8');
  }
}
