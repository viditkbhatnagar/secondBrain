import { logger } from '../utils/logger';

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: Date;
  tags: Record<string, string>;
}

class MetricsService {
  private metrics: PerformanceMetric[] = [];
  private readonly FLUSH_INTERVAL = 60000; // 1 minute

  constructor() {
    // Periodically flush metrics
    setInterval(() => this.flush(), this.FLUSH_INTERVAL);
  }

  // Record a timing metric
  timing(name: string, durationMs: number, tags: Record<string, string> = {}): void {
    this.record(name, durationMs, tags);
    
    // Log slow operations
    if (durationMs > 2000) {
      logger.warn(`Slow operation: ${name} took ${durationMs}ms`, tags);
    }
  }

  // Record a counter
  increment(name: string, value: number = 1, tags: Record<string, string> = {}): void {
    this.record(name, value, tags);
  }

  // Record a gauge
  gauge(name: string, value: number, tags: Record<string, string> = {}): void {
    this.record(name, value, tags);
  }

  private record(name: string, value: number, tags: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      timestamp: new Date(),
      tags
    });
  }

  private flush(): void {
    if (this.metrics.length === 0) return;

    // Calculate aggregates
    const aggregates = new Map<string, { sum: number; count: number; min: number; max: number }>();

    for (const metric of this.metrics) {
      const key = metric.name;
      const existing = aggregates.get(key) || { sum: 0, count: 0, min: Infinity, max: -Infinity };
      
      existing.sum += metric.value;
      existing.count++;
      existing.min = Math.min(existing.min, metric.value);
      existing.max = Math.max(existing.max, metric.value);
      
      aggregates.set(key, existing);
    }

    // Log aggregates
    for (const [name, stats] of aggregates) {
      logger.info(`Metric: ${name}`, {
        avg: Math.round(stats.sum / stats.count),
        min: stats.min,
        max: stats.max,
        count: stats.count
      });
    }

    this.metrics = [];
  }

  // Get current stats
  getStats(): Record<string, any> {
    const stats: Record<string, { count: number; avgValue: number }> = {};

    for (const metric of this.metrics) {
      if (!stats[metric.name]) {
        stats[metric.name] = { count: 0, avgValue: 0 };
      }
      stats[metric.name].count++;
      stats[metric.name].avgValue = 
        (stats[metric.name].avgValue * (stats[metric.name].count - 1) + metric.value) / 
        stats[metric.name].count;
    }

    return stats;
  }
}

export const metricsService = new MetricsService();

// Helper decorator for timing functions
export function timed(name: string) {
  return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const start = Date.now();
      try {
        return await originalMethod.apply(this, args);
      } finally {
        metricsService.timing(name, Date.now() - start);
      }
    };

    return descriptor;
  };
}
