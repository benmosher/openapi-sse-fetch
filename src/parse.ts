import { openapi } from '@scalar/openapi-parser';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

export async function loadSpec(inputPath: string): Promise<any> {
  const content = fs.readFileSync(inputPath, 'utf-8');
  const raw = inputPath.endsWith('.yaml') || inputPath.endsWith('.yml')
    ? yaml.load(content)
    : JSON.parse(content);

  const { schema, errors } = await openapi().load(raw).dereference().get();
  if (errors && errors.length > 0) {
    throw new Error(`OpenAPI parse errors: ${errors.map((e: any) => e.message).join(', ')}`);
  }
  return schema;
}
