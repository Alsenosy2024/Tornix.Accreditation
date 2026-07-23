import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from './throttle';

describe('throttle (trailing, no leading)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does NOT call on first invocation', () => {
    const fn = vi.fn();
    const t = throttle(fn, 1000);
    t(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls once after the interval with the latest argument', () => {
    const fn = vi.fn();
    const t = throttle(fn, 1000);
    t(1); t(2); t(3);
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(3);
  });

  it('flush() invokes immediately with the latest argument', () => {
    const fn = vi.fn();
    const t = throttle(fn, 1000);
    t(7);
    t.flush();
    expect(fn).toHaveBeenCalledWith(7);
  });

  it('cancel() prevents pending invocation', () => {
    const fn = vi.fn();
    const t = throttle(fn, 1000);
    t(1);
    t.cancel();
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
  });
});
