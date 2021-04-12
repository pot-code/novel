export function sleep(t: number): Promise<void> {
  return new Promise((res) => {
    setTimeout(() => {
      res(null);
    }, t);
  });
}

export function withRetry<T>(
  fn: (...args: any) => T,
  times: number,
  delay = 0,
): (...args: any) => Promise<T> {
  console.assert(times > 0, 'times must be larger than 0');
  return async function (...args: any): Promise<T> {
    for (let i = 0; i < times; i++) {
      try {
        return fn(...args);
      } catch (e) {}
      if (delay > 0) sleep(delay);
    }
    return fn(...args);
  };
}

function padStart(v: any, length: number, fill: string): string {
  return String(v).padStart(length, fill);
}

export function getRealIndex(index: number, skip: number): number {
  return index - skip;
}

export function timestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${padStart(now.getMonth() + 1, 2, '0')}${padStart(
    now.getDate(),
    2,
    '0',
  )}${padStart(now.getHours(), 2, '0')}${padStart(now.getMinutes(), 2, '0')}${padStart(
    now.getSeconds(),
    2,
    '0',
  )}`;
}
