import { logger } from '../utils/logger';

interface ParallelTask<T> {
  id: string;
  fn: () => Promise<T>;
  priority?: number;
  timeout?: number;
}

interface ParallelResult<T> {
  id: string;
  success: boolean;
  data?: T;
  error?: Error;
  duration: number;
}

export class ParallelProcessor {
  private maxConcurrency: number;

  constructor(maxConcurrency = 5) {
    this.maxConcurrency = maxConcurrency;
  }

  // Execute tasks in parallel with concurrency limit
  async executeParallel<T>(tasks: ParallelTask<T>[]): Promise<ParallelResult<T>[]> {
    const results: ParallelResult<T>[] = [];
    const executing: Promise<void>[] = [];

    // Sort by priority (higher first)
    const sortedTasks = [...tasks].sort((a, b) => 
      (b.priority || 0) - (a.priority || 0)
    );

    for (const task of sortedTasks) {
      const promise = this.executeTask(task).then(result => {
        results.push(result);
      });

      executing.push(promise);

      // If at max concurrency, wait for one to complete
      if (executing.length >= this.maxConcurrency) {
        await Promise.race(executing);
        // Remove completed promises
        const completedIndex = executing.findIndex(p => p === promise);
        if (completedIndex > -1) {
          executing.splice(completedIndex, 1);
        }
      }
    }

    // Wait for remaining tasks
    await Promise.all(executing);

    return results;
  }

  private async executeTask<T>(task: ParallelTask<T>): Promise<ParallelResult<T>> {
    const startTime = Date.now();

    try {
      // Apply timeout if specified
      const data = task.timeout
        ? await this.withTimeout(task.fn(), task.timeout)
        : await task.fn();

      return {
        id: task.id,
        success: true,
        data,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        id: task.id,
        success: false,
        error: error as Error,
        duration: Date.now() - startTime
      };
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Task timeout')), ms)
      )
    ]);
  }

  // Execute with early return (return as soon as N succeed)
  async executeWithEarlyReturn<T>(
    tasks: ParallelTask<T>[],
    requiredSuccesses: number = 1
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const results: T[] = [];
      let completed = 0;
      let errors = 0;

      for (const task of tasks) {
        this.executeTask(task).then(result => {
          completed++;

          if (result.success && result.data) {
            results.push(result.data);
            if (results.length >= requiredSuccesses) {
              resolve(results);
            }
          } else {
            errors++;
          }

          if (completed === tasks.length && results.length < requiredSuccesses) {
            if (results.length > 0) {
              resolve(results);
            } else {
              reject(new Error('All tasks failed'));
            }
          }
        });
      }
    });
  }
}

export const parallelProcessor = new ParallelProcessor();
