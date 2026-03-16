import ts from 'typescript';
import { SseOperation } from './extract';
import { schemaToTs, schemaRegistry } from './schema-to-ts';

export function toPascalCase(str: string): string {
  return str
    .replace(/(^|[-_/])([a-z])/g, (_, __, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

export function generateEventType(op: SseOperation): ts.TypeAliasDeclaration {
  const typeName = `${toPascalCase(op.operationId)}Event`;
  const schema = op.itemSchema;

  let typeNode: ts.TypeNode;

  if (schema.oneOf) {
    const members = schema.oneOf.map((variant: any) => {
      const variantMembers: ts.TypeElement[] = [];

      const eventProp = variant.properties?.event;
      const dataProp = variant.properties?.data;
      const idProp = variant.properties?.id;

      if (eventProp) {
        variantMembers.push(
          ts.factory.createPropertySignature(
            undefined,
            'event',
            undefined,
            schemaToTs(eventProp)
          )
        );
      }

      if (dataProp) {
        variantMembers.push(
          ts.factory.createPropertySignature(
            undefined,
            'data',
            undefined,
            schemaToTs(dataProp)
          )
        );
      }

      if (idProp) {
        variantMembers.push(
          ts.factory.createPropertySignature(
            undefined,
            'id',
            ts.factory.createToken(ts.SyntaxKind.QuestionToken),
            schemaToTs(idProp)
          )
        );
      }

      return ts.factory.createTypeLiteralNode(variantMembers);
    });
    typeNode = ts.factory.createUnionTypeNode(members);
  } else {
    typeNode = schemaToTs(schema);
  }

  return ts.factory.createTypeAliasDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    typeName,
    undefined,
    typeNode
  );
}

export function generateParamsType(op: SseOperation): ts.InterfaceDeclaration {
  const typeName = `${toPascalCase(op.operationId)}Params`;
  const members: ts.TypeElement[] = [];

  // Path params
  const pathParams = op.parameters.filter((p: any) => p.in === 'path');
  for (const p of pathParams) {
    members.push(
      ts.factory.createPropertySignature(
        undefined,
        p.name,
        p.required ? undefined : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        p.schema ? schemaToTs(p.schema) : ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
      )
    );
  }

  // Query params
  const queryParams = op.parameters.filter((p: any) => p.in === 'query');
  if (queryParams.length > 0) {
    const queryMembers = queryParams.map((p: any) =>
      ts.factory.createPropertySignature(
        undefined,
        p.name,
        p.required ? undefined : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        p.schema ? schemaToTs(p.schema) : ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)
      )
    );
    members.push(
      ts.factory.createPropertySignature(
        undefined,
        'query',
        ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        ts.factory.createTypeLiteralNode(queryMembers)
      )
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
          : ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
      )
    );
  }

  return ts.factory.createInterfaceDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    typeName,
    undefined,
    undefined,
    members
  );
}

// After all types have been generated, emit any referenced named schemas
export function generateReferencedSchemaTypes(): ts.TypeAliasDeclaration[] {
  const result: ts.TypeAliasDeclaration[] = [];
  for (const [name, schema] of schemaRegistry) {
    const schemaWithoutTitle = { ...schema, title: undefined };
    // Use schemaToTs but suppress re-registration
    const typeNode = buildTypeNodeForSchema(schemaWithoutTitle);
    result.push(
      ts.factory.createTypeAliasDeclaration(
        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        name,
        undefined,
        typeNode
      )
    );
  }
  return result;
}

// Build a type node without registering titles (to avoid re-registration loops)
function buildTypeNodeForSchema(schema: any): ts.TypeNode {
  if (!schema) return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);

  if (schema.contentMediaType === 'application/json') {
    if (schema.contentSchema) {
      return buildTypeNodeForSchema(schema.contentSchema);
    }
    return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
  }

  if (schema.title) {
    // Just reference, don't re-register
    return ts.factory.createTypeReferenceNode(schema.title, undefined);
  }

  if (schema.const !== undefined) {
    const val = schema.const;
    if (typeof val === 'string') {
      return ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(val));
    }
    if (typeof val === 'number') {
      return ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral(val));
    }
    if (typeof val === 'boolean') {
      return ts.factory.createLiteralTypeNode(val ? ts.factory.createTrue() : ts.factory.createFalse());
    }
  }

  if (schema.oneOf) {
    const types = schema.oneOf.map((s: any) => buildTypeNodeForSchema(s));
    return ts.factory.createUnionTypeNode(types);
  }

  if (schema.allOf) {
    const types = schema.allOf.map((s: any) => buildTypeNodeForSchema(s));
    return ts.factory.createIntersectionTypeNode(types);
  }

  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  if (t === 'string') return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
  if (t === 'integer' || t === 'number') return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
  if (t === 'boolean') return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
  if (t === 'null') return ts.factory.createLiteralTypeNode(ts.factory.createNull());

  if (t === 'array') {
    const itemType = schema.items
      ? buildTypeNodeForSchema(schema.items)
      : ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
    return ts.factory.createArrayTypeNode(itemType);
  }

  if (t === 'object' || schema.properties) {
    const props = Object.entries(schema.properties || {}).map(([key, propSchema]) => {
      const required = schema.required?.includes(key) ?? false;
      return ts.factory.createPropertySignature(
        undefined,
        key,
        required ? undefined : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
        buildTypeNodeForSchema(propSchema as any)
      );
    });
    return ts.factory.createTypeLiteralNode(props);
  }

  return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
}
