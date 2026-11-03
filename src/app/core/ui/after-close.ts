import { DestroyRef } from '@angular/core';

/** Runs work after a PrimeNG dialog finishes its hide animation. */
export class AfterClose {
  private task: (() => Promise<void>) | null = null;

  queue(task: () => Promise<void>): void {
    this.task = task;
  }

  async flush(): Promise<void> {
    const task = this.task;
    this.task = null;
    await task?.();
  }
}

/** Runs work after a custom overlay has been removed and painted away. */
export function afterOverlayGone(destroyRef: DestroyRef, task: () => void | Promise<void>): void {
  let cancelled = false;
  let first = 0;
  let second = 0;
  const stop = destroyRef.onDestroy(() => {
    cancelled = true;
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
  });
  first = requestAnimationFrame(() => {
    second = requestAnimationFrame(() => {
      stop();
      if (!cancelled) void task();
    });
  });
}
