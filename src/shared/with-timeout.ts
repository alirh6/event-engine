/** Raised when an operation does not complete within its budget. */
export class TimeoutError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Races a promise against a timeout, clearing the timer on both outcomes. */
export async function withTimeout<TValue>(promise: Promise<TValue>, timeoutMs: number, label: string): Promise<TValue> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout((): void => {
          reject(new TimeoutError(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
