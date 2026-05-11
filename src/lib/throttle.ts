export interface ThrottledFn<T extends any[]> {
  (...args: T): void;
  flush(): void;
  cancel(): void;
}

export function throttle<T extends any[]>(fn: (...args: T) => void, intervalMs: number): ThrottledFn<T> {
  let pending: { args: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    timer = null;
    if (pending) {
      const args = pending.args;
      pending = null;
      fn(...args);
    }
  };

  const t = ((...args: T) => {
    pending = { args };
    if (timer === null) {
      timer = setTimeout(fire, intervalMs);
    }
  }) as ThrottledFn<T>;

  t.flush = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (pending) {
      const args = pending.args; pending = null;
      fn(...args);
    }
  };

  t.cancel = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    pending = null;
  };

  return t;
}
