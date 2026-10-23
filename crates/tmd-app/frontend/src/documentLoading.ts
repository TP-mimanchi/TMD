/** Share in-flight reads without retaining loaded document contents. */
export function createDocumentLoadQueue() {
  const pending = new Map<number, Promise<boolean>>();
  return {
    load(id: number, read: () => Promise<boolean>): Promise<boolean> {
      const existing = pending.get(id);
      if (existing) return existing;
      const request = Promise.resolve().then(read).finally(() => {
        if (pending.get(id) === request) pending.delete(id);
      });
      pending.set(id, request);
      return request;
    },
  };
}
