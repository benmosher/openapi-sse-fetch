import { SseOperation } from './extract';
import { toPascalCase } from './typegen';

/**
 * Generate the URL expression for an operation, interpolating path parameters.
 * e.g. /users/{userId}/items -> `${BASE_URL}/users/${params.userId}/items`
 */
function buildUrlExpression(path: string, op: SseOperation): string {
  const hasPathParams = op.parameters.some((p: any) => p.in === 'path');
  const hasQueryParams = op.parameters.some((p: any) => p.in === 'query');

  // Replace {param} with ${params.param}
  let urlPath = path.replace(/\{([^}]+)\}/g, (_match, paramName) => {
    return `\${params.${paramName}}`;
  });

  const baseExpr = `\`\${BASE_URL}${urlPath}\``;

  if (hasQueryParams) {
    // Build query string via URLSearchParams
    return `(() => {
    const _url = new URL(${baseExpr});
    if (params.query) {
      for (const [k, v] of Object.entries(params.query)) {
        if (v !== undefined && v !== null) _url.searchParams.set(k, String(v));
      }
    }
    return _url.toString();
  })()`;
  }

  if (hasPathParams) {
    return baseExpr;
  }

  return `\`\${BASE_URL}${path}\``;
}

/**
 * Build the onmessage handler body for a oneOf itemSchema.
 */
function buildOneOfDispatch(oneOfVariants: any[], eventTypeName: string): string {
  const cases: string[] = [];

  for (const variant of oneOfVariants) {
    const eventConst = variant.properties?.event?.const;
    const dataProp = variant.properties?.data;
    const idProp = variant.properties?.id;

    if (eventConst === undefined) continue;

    const isJsonData =
      dataProp?.contentMediaType === 'application/json';

    const dataExpr = dataProp
      ? isJsonData
        ? 'JSON.parse(msg.data)'
        : 'msg.data'
      : 'msg.data';

    const pushFields: string[] = [`event: ${JSON.stringify(eventConst)}`];
    if (dataProp) {
      pushFields.push(`data: ${dataExpr}`);
    }
    if (idProp) {
      pushFields.push('id: msg.id');
    }

    cases.push(
      `      if (msg.event === ${JSON.stringify(eventConst)}) {
        ch.push({ ${pushFields.join(', ')} } as ${eventTypeName});
        return;
      }`
    );
  }

  if (cases.length === 0) {
    return `      ch.push(JSON.parse(msg.data) as ${eventTypeName});`;
  }

  return cases.join('\n');
}

/**
 * Build the onmessage handler body for a flat (non-oneOf) itemSchema.
 */
function buildFlatDispatch(itemSchema: any, eventTypeName: string): string {
  // If it's a simple string or primitive, just push msg.data
  const t = Array.isArray(itemSchema.type) ? itemSchema.type[0] : itemSchema.type;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'integer') {
    return `      ch.push(msg.data as unknown as ${eventTypeName});`;
  }
  // Otherwise assume JSON
  return `      ch.push(JSON.parse(msg.data) as ${eventTypeName});`;
}

/**
 * Generate a complete async generator function as a string for an SSE operation.
 */
export function generateFunction(op: SseOperation, baseUrl: string): string {
  const funcName = op.operationId.charAt(0).toLowerCase() + op.operationId.slice(1);
  const pascalName = toPascalCase(op.operationId);
  const paramsTypeName = `${pascalName}Params`;
  const eventTypeName = `${pascalName}Event`;

  const urlExpr = buildUrlExpression(op.path, op);

  // Build headers object
  const hasBody = !!op.requestBody;
  const headersExpr = hasBody
    ? `{ 'Content-Type': 'application/json', ...options?.headers }`
    : `{ ...options?.headers }`;

  // Build fetchEventSource options
  const fetchOptions: string[] = [
    `    method: '${op.method.toUpperCase()}',`,
    `    headers: ${headersExpr},`,
  ];

  if (hasBody) {
    fetchOptions.push(`    body: JSON.stringify(params.body),`);
  }

  fetchOptions.push(`    signal: options?.signal,`);

  // Build onmessage dispatch
  let onmessageBody: string;
  if (op.itemSchema.oneOf) {
    onmessageBody = buildOneOfDispatch(op.itemSchema.oneOf, eventTypeName);
  } else {
    onmessageBody = buildFlatDispatch(op.itemSchema, eventTypeName);
  }

  const paramsArg = `params: ${paramsTypeName}`;
  const needsParams =
    op.parameters.length > 0 ||
    op.requestBody !== undefined;

  // If no params at all, still generate the interface but make it optional
  const paramsArgDecl = needsParams
    ? paramsArg
    : `params: ${paramsTypeName} = {} as ${paramsTypeName}`;

  return `export async function* ${funcName}(
  ${paramsArgDecl},
  options?: { signal?: AbortSignal; headers?: HeadersInit }
): AsyncGenerator<${eventTypeName}> {
  const ch = createChannel<${eventTypeName}>();
  const _url = ${urlExpr};

  fetchEventSource(_url, {
${fetchOptions.join('\n')}
    async onopen(res) {
      if (!res.ok) throw new Error(\`SSE open failed: \${res.status}\`);
    },
    onmessage(msg) {
${onmessageBody}
    },
    onclose() { ch.done(); },
    onerror(err) { ch.error(err); throw err; },
  }).catch((err: unknown) => ch.error(err));

  yield* ch.iter();
}`;
}
