export const HELPERS_TEMPLATE = `
const _DONE = Symbol('done');

export function createChannel<T>() {
  const queue: Array<T | typeof _DONE> = [];
  let waiter: ((v: T | typeof _DONE) => void) | null = null;
  let pendingError: unknown = null;

  const notify = (v: T | typeof _DONE) => {
    if (waiter) { const w = waiter; waiter = null; w(v); }
    else queue.push(v);
  };

  return {
    push: (v: T) => notify(v),
    done: () => notify(_DONE),
    error: (e: unknown) => { pendingError = e; notify(_DONE); },
    async *iter(): AsyncGenerator<T> {
      while (true) {
        let v: T | typeof _DONE;
        if (queue.length) { v = queue.shift()!; }
        else { v = await new Promise(r => { waiter = r; }); }
        if (v === _DONE) { if (pendingError) throw pendingError; return; }
        yield v as T;
      }
    },
  };
}
`;
