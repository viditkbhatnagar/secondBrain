import { logger } from './logger';

/**
 * Keep-alive utility for Render deployment
 * Prevents the service from sleeping on free/starter plans
 */
export class KeepAlive {
  private interval: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL = 14 * 60 * 1000; // 14 minutes (Render sleeps after 15 min inactivity)

  /**
   * Start keep-alive pings (only in production)
   */
  start(serviceUrl?: string): void {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Keep-alive disabled in development');
      return;
    }

    // Only enable if explicitly configured
    if (process.env.KEEP_ALIVE_ENABLED !== 'true') {
      logger.debug('Keep-alive not enabled');
      return;
    }

    const url = serviceUrl || process.env.RENDER_EXTERNAL_URL || process.env.SERVICE_URL;
    
    if (!url) {
      logger.warn('Keep-alive: No service URL configured');
      return;
    }

    logger.info(`Keep-alive started, pinging ${url} every 14 minutes`);

    this.interval = setInterval(async () => {
      try {
        const response = await fetch(`${url}/api/health`);
        if (response.ok) {
          logger.debug('Keep-alive ping successful');
        } else {
          logger.warn(`Keep-alive ping failed: ${response.status}`);
        }
      } catch (error) {
        logger.warn('Keep-alive ping error:', error);
      }
    }, this.PING_INTERVAL);
  }

  /**
   * Stop keep-alive pings
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Keep-alive stopped');
    }
  }
}

export const keepAlive = new KeepAlive();
