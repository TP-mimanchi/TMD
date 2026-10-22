/** Coalesce derived UI work while delivering the latest state, not the first event. */
export function createCoalescedUpdate<T>(
  run: (value: T) => void,
  request: (callback: () => void) => number,
  cancelRequest: (id: number) => void,
  restart = false,
) {
  let pending: number | undefined;
  let latest: T;
  return {
    schedule(value: T) {
      latest = value;
      if (pending !== undefined) {
        if (!restart) return;
        cancelRequest(pending);
      }
      pending = request(() => {
        pending = undefined;
        run(latest);
      });
    },
    cancel() {
      if (pending !== undefined) cancelRequest(pending);
      pending = undefined;
    },
  };
}
