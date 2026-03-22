import ts from 'typescript';
import { SseOperation } from './extract';
import { schemaToTs, schemaRegistry } from './schema-to-ts';

export function toPascalCase(str: string): string {
  return str
    .replace(/(^|[-_/])([a-z])/g, (_, __, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

// Returns one declaration per named variant (when event.const is a string)
// followed by the union alias that references them.  For flat (non-oneOf)
// itemSchemas a single alias is returned.
export function generateEventType(op: SseOperation): ts.TypeAliasDeclaration[] {
  const prefix = toPascalCase(op.operationId);
  const unionTypeName = `${prefix}Event`;
  const schema = op.itemSchema;

  if (!schema.oneOf) {
    return [
      ts.factory.createTypeAliasDeclaration(
        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        unionTypeName,
        undefined,
        schemaToTs(schema),
      ),
    ];
  }

  const namedDecls: ts.TypeAliasDeclaration[] = [];
  const unionMembers: ts.TypeNode[] = [];

  for (const variant of schema.oneOf) {
    const eventConst = variant.properties?.event?.const;
    const variantNode = buildVariantTypeNode(variant);

    if (typeof eventConst === 'string') {
      const variantTypeName = `${prefix}${toPascalCase(eventConst)}Event`;
      namedDecls.push(
        ts.factory.createTypeAliasDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          variantTypeName,
          undefined,
          variantNode,
        ),
      );
      unionMembers.push(
        ts.factory.createTypeReferenceNode(variantTypeName, undefined),
      );
    } else {
      unionMembers.push(variantNode);
    }
  }

  const unionDecl = ts.factory.createTypeAliasDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    unionTypeName,
    undefined,
    ts.factory.createUnionTypeNode(unionMembers),
  );

  return [...namedDecls, unionDecl];
}

function buildVariantTypeNode(variant: any): ts.TypeLiteralNode {
  const members: ts.TypeElement[] = [];
  const {
    event: eventProp,
    data: dataProp,
    id: idProp,
  } = variant.properties ?? {};

  if (eventProp) {
    members.push(
      ts.factory.createPropertySignature(
        undefined,
        'event',
        undefined,
        schemaToTs(eventProp),
      ),
    );
  }
  if (dataProp) {
    members.push(
      ts.factory.createPropertySignature(
        undefined,
        'data',
        undefined,
        schemaToTs(dataProp),
      ),
    );
  }
  if (idProp) {
    members.push(
      ts.factory.createPropertySignature(
        undefined,
        'id',
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        schemaToTs(idProp),
      ),
    );
  }
  return ts.factory.createTypeLiteralNode(members);
}

export function generateParamsType(
  op: SseOperation,
): ts.InterfaceDeclaration | null {
  const typeName = `${toPascalCase(op.operationId)}Params`;
  const members: ts.TypeElement[] = [];

  // Path params
  const pathParams = op.parameters.filter((p: any) => p.in === 'path');
  for (const p of pathParams) {
    members.push(
      ts.factory.createPropertySignature(
        undefined,
        p.name,
        p.required
          ? undefined
          : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        p.schema
          ? schemaToTs(p.schema)
          : ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      ),
    );
  }

  // Query params
  const queryParams = op.parameters.filter((p: any) => p.in === 'query');
  if (queryParams.length > 0) {
    const queryMembers = queryParams.map((p: any) =>
      ts.factory.createPropertySignature(
        undefined,
        p.name,
        p.required
          ? undefined
          : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        p.schema
          ? schemaToTs(p.schema)
          : ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
      ),
    );
    members.push(
      ts.factory.createPropertySignature(
        undefined,
        'query',
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        ts.factory.createTypeLiteralNode(queryMembers),
      ),
    );
  }

  // Request body
  if (op.requestBody) {
    const bodySchema = op.requestBody.content?.['application/json']?.schema;
    members.push(
      ts.factory.createPropertySignature(
        undefined,
        'body',
        undefined,
        bodySchema
          ? schemaToTs(bodySchema)
          : ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword),
      ),
    );
  }

  if (members.length === 0) return null;

  return ts.factory.createInterfaceDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    typeName,
    undefined,
    undefined,
    members,
  );
}

// After all types have been generated, emit any referenced named schemas.
// Uses schemaToTs (which registers nested titled schemas) and loops until the
// registry stops growing, so transitively-referenced types like Message are
// always included.
export function generateReferencedSchemaTypes(): ts.TypeAliasDeclaration[] {
  const emitted = new Set<string>();
  const result: ts.TypeAliasDeclaration[] = [];

  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, schema] of schemaRegistry) {
      if (emitted.has(name)) continue;
      emitted.add(name);
      changed = true;

      // Strip title before calling schemaToTs so it doesn't self-register,
      // but schemaToTs will still register any nested titled schemas it finds.
      const schemaWithoutTitle = { ...schema, title: undefined };
      const typeNode = schemaToTs(schemaWithoutTitle);
      result.push(
        ts.factory.createTypeAliasDeclaration(
          [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
          name,
          undefined,
          typeNode,
        ),
      );
    }
  }

  return result;
}
