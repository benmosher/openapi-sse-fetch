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
        if (!sseContent?.schema?.itemSchema) continue;
        ops.push({
          operationId: op.operationId || `${method}${path.replace(/[^a-zA-Z0-9]/g, '_')}`,
          method,
          path,
          parameters: op.parameters || [],
          requestBody: op.requestBody,
          itemSchema: sseContent.schema.itemSchema,
        });
      }
    }
  }
  return ops;
}
