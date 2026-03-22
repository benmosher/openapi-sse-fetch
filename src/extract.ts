export interface SseOperation {
  operationId: string;
  method: string;
  path: string;
  parameters: any[];
  requestBody?: any;
  itemSchema: any;
}

export function extractSseOperations(spec: any): SseOperation[] {
  const ops: SseOperation[] = [];
  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const op = (pathItem as any)[method];
      if (!op) continue;
      for (const [_status, response] of Object.entries(op.responses || {})) {
        const sseContent = (response as any)?.content?.['text/event-stream'];
        // Support both the bump.sh spec format (schema.itemSchema) and the
        // FastAPI native format where itemSchema sits directly on the content object.
        const itemSchema =
          sseContent?.schema?.itemSchema ?? sseContent?.itemSchema;
        if (!itemSchema) continue;
        ops.push({
          operationId:
            op.operationId || `${method}${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
          method,
          path,
          parameters: op.parameters || [],
          requestBody: op.requestBody,
          itemSchema,
        });
      }
    }
  }
  return ops;
}
