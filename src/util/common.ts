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

export function timestamp(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  ]
    .map(String)
    .map((v) => (v.length < 2 ? padStart(v, 2, '0') : v))
    .join('');
}
