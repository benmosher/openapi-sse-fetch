import ts from 'typescript';

export const schemaRegistry = new Map<string, any>();

export function schemaToTs(schema: any): ts.TypeNode {
  if (!schema)
    return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);

  // contentMediaType handling
  if (schema.contentMediaType === 'application/json') {
    if (schema.contentSchema) {
      return schemaToTs(schema.contentSchema);
    }
    return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
  }

  // titled schema - register and return reference (only for non-primitive types)
  if (schema.title) {
    const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
    const isPrimitive =
      t === 'string' ||
      t === 'integer' ||
      t === 'number' ||
      t === 'boolean' ||
      t === 'null';
    if (!isPrimitive) {
      schemaRegistry.set(schema.title, schema);
      return ts.factory.createTypeReferenceNode(schema.title, undefined);
    }
    // Fall through to type-based generation for primitive types
  }

  // const literal
  if (schema.const !== undefined) {
    const val = schema.const;
    if (typeof val === 'string') {
      return ts.factory.createLiteralTypeNode(
        ts.factory.createStringLiteral(val),
      );
    }
    if (typeof val === 'number') {
      return ts.factory.createLiteralTypeNode(
        ts.factory.createNumericLiteral(val),
      );
    }
    if (typeof val === 'boolean') {
      return ts.factory.createLiteralTypeNode(
        val ? ts.factory.createTrue() : ts.factory.createFalse(),
      );
    }
  }

  // enum → union of literals
  if (Array.isArray(schema.enum)) {
    const members = schema.enum.map((v: any) => {
      if (typeof v === 'string')
        return ts.factory.createLiteralTypeNode(
          ts.factory.createStringLiteral(v),
        );
      if (typeof v === 'number')
        return ts.factory.createLiteralTypeNode(
          ts.factory.createNumericLiteral(v),
        );
      if (typeof v === 'boolean')
        return ts.factory.createLiteralTypeNode(
          v ? ts.factory.createTrue() : ts.factory.createFalse(),
        );
      if (v === null)
        return ts.factory.createLiteralTypeNode(ts.factory.createNull());
      return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
    });
    return members.length === 1
      ? members[0]
      : ts.factory.createUnionTypeNode(members);
  }

  // oneOf
  if (schema.oneOf) {
    const types = schema.oneOf.map((s: any) => schemaToTs(s));
    return ts.factory.createUnionTypeNode(types);
  }

  // allOf
  if (schema.allOf) {
    const types = schema.allOf.map((s: any) => schemaToTs(s));
    return ts.factory.createIntersectionTypeNode(types);
  }

  // type-based
  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  if (t === 'string')
    return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
  if (t === 'integer' || t === 'number')
    return ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
  if (t === 'boolean')
    return ts.factory.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
  if (t === 'null')
    return ts.factory.createLiteralTypeNode(ts.factory.createNull());

  if (t === 'array') {
    const itemType = schema.items
      ? schemaToTs(schema.items)
      : ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
    return ts.factory.createArrayTypeNode(itemType);
  }

  if (t === 'object' || schema.properties) {
    const props = Object.entries(schema.properties || {}).map(
      ([key, propSchema]) => {
        const required = schema.required?.includes(key) ?? false;
        return ts.factory.createPropertySignature(
          undefined,
          key,
          required
            ? undefined
            : ts.factory.createToken(ts.SyntaxKind.QuestionToken),
          schemaToTs(propSchema as any),
        );
      },
    );
    return ts.factory.createTypeLiteralNode(props);
  }

  return ts.factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword);
}

export function generateSchemaTypeAlias(
  name: string,
  schema: any,
): ts.TypeAliasDeclaration {
  // Temporarily remove title to avoid infinite recursion when generating the body
  const schemaWithoutTitle = { ...schema, title: undefined };
  const typeNode = schemaToTs(schemaWithoutTitle);
  return ts.factory.createTypeAliasDeclaration(
    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    name,
    undefined,
    typeNode,
  );
}
