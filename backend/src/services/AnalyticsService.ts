import { AnalyticsEvent, DailyStats, EventType, IAnalyticsEvent } from '../models/Analytics';
import { DocumentModel } from '../models';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';

class AnalyticsService {
  // Track an event
  async trackEvent(
    eventType: EventType,
    sessionId: string,
    metadata: IAnalyticsEvent['metadata'] = {},
    userId?: string
  ): Promise<void> {
    try {
      await AnalyticsEvent.create({
        eventType,
        userId,
        sessionId,
        timestamp: new Date(),
        metadata
      });

      // Update daily stats asynchronously
      this.updateDailyStats(eventType, metadata).catch(err =>
        logger.error('Failed to update daily stats:', err)
      );
    } catch (error) {
      logger.error('Failed to track event:', error);
    }
  }

  // Hash IP for privacy
  hashIP(ip: string): string {
    return createHash('sha256').update(ip + (process.env.IP_SALT || 'salt')).digest('hex').slice(0, 16);
  }

  // Update daily aggregated stats
  private async updateDailyStats(eventType: EventType, metadata: IAnalyticsEvent['metadata']): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const updateQuery: any = { $inc: {} };

    switch (eventType) {
      case 'search':
        updateQuery.$inc.totalSearches = 1;
        break;
      case 'chat_message':
        updateQuery.$inc.totalChats = 1;
        break;
      case 'document_upload':
        updateQuery.$inc.totalUploads = 1;
        break;
      case 'document_view':
        updateQuery.$inc.totalDocumentViews = 1;
        break;
      case 'error':
        updateQuery.$inc.errorCount = 1;
        break;
      case 'ai_response':
        if (metadata.tokensUsed) {
          updateQuery.$inc.totalTokensUsed = metadata.tokensUsed;
        }
        break;
    }

    await DailyStats.findOneAndUpdate(
      { date: today },
      updateQuery,
      { upsert: true, new: true }
    );
  }

  // Get dashboard overview stats
  async getOverviewStats(days: number = 30): Promise<{
    totalSearches: number;
    totalChats: number;
    totalUploads: number;
    totalDocuments: number;
    avgResponseTime: number;
    avgConfidence: number;
    totalTokensUsed: number;
    uniqueSessions: number;
    errorRate: number;
    trends: {
      searches: number;
      chats: number;
      uploads: number;
    };
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - days);

    // Current period stats
    const currentStats = await AnalyticsEvent.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          totalSearches: { $sum: { $cond: [{ $eq: ['$eventType', 'search'] }, 1, 0] } },
          totalChats: { $sum: { $cond: [{ $eq: ['$eventType', 'chat_message'] }, 1, 0] } },
          totalUploads: { $sum: { $cond: [{ $eq: ['$eventType', 'document_upload'] }, 1, 0] } },
          totalErrors: { $sum: { $cond: [{ $eq: ['$eventType', 'error'] }, 1, 0] } },
          avgResponseTime: { $avg: '$metadata.responseTime' },
          avgConfidence: { $avg: '$metadata.confidence' },
          totalTokensUsed: { $sum: { $ifNull: ['$metadata.tokensUsed', 0] } },
          uniqueSessions: { $addToSet: '$sessionId' },
          totalEvents: { $sum: 1 }
        }
      }
    ]);

    // Previous period for trends
    const previousStats = await AnalyticsEvent.aggregate([
      { $match: { timestamp: { $gte: previousStartDate, $lt: startDate } } },
      {
        $group: {
          _id: null,
          totalSearches: { $sum: { $cond: [{ $eq: ['$eventType', 'search'] }, 1, 0] } },
          totalChats: { $sum: { $cond: [{ $eq: ['$eventType', 'chat_message'] }, 1, 0] } },
          totalUploads: { $sum: { $cond: [{ $eq: ['$eventType', 'document_upload'] }, 1, 0] } }
        }
      }
    ]);

    const current = currentStats[0] || {
      totalSearches: 0,
      totalChats: 0,
      totalUploads: 0,
      totalErrors: 0,
      avgResponseTime: 0,
      avgConfidence: 0,
      totalTokensUsed: 0,
      uniqueSessions: [],
      totalEvents: 0
    };

    const previous = previousStats[0] || {
      totalSearches: 0,
      totalChats: 0,
      totalUploads: 0
    };

    // Calculate trends (percentage change)
    const calcTrend = (curr: number, prev: number): number => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    // Get total documents from Documents collection
    const totalDocuments = await DocumentModel.countDocuments();

    return {
      totalSearches: current.totalSearches,
      totalChats: current.totalChats,
      totalUploads: current.totalUploads,
      totalDocuments,
      avgResponseTime: Math.round(current.avgResponseTime || 0),
      avgConfidence: Math.round(current.avgConfidence || 0),
      totalTokensUsed: current.totalTokensUsed || 0,
      uniqueSessions: current.uniqueSessions?.length || 0,
      errorRate: current.totalEvents > 0
        ? Math.round((current.totalErrors / current.totalEvents) * 100 * 10) / 10
        : 0,
      trends: {
        searches: calcTrend(current.totalSearches, previous.totalSearches),
        chats: calcTrend(current.totalChats, previous.totalChats),
        uploads: calcTrend(current.totalUploads, previous.totalUploads)
      }
    };
  }


  // Get time series data for charts
  async getTimeSeriesData(
    eventTypes: EventType[],
    days: number = 30,
    granularity: 'hour' | 'day' | 'week' = 'day'
  ): Promise<Array<{
    timestamp: string;
    date: string;
    [key: string]: number | string;
  }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    let groupBy: any;

    switch (granularity) {
      case 'hour':
        groupBy = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' },
          hour: { $hour: '$timestamp' }
        };
        break;
      case 'week':
        groupBy = {
          year: { $year: '$timestamp' },
          week: { $week: '$timestamp' }
        };
        break;
      default:
        groupBy = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        };
    }

    const pipeline: any[] = [
      { $match: { timestamp: { $gte: startDate }, eventType: { $in: eventTypes } } },
      {
        $group: {
          _id: {
            date: groupBy,
            eventType: '$eventType'
          },
          count: { $sum: 1 },
          avgResponseTime: { $avg: '$metadata.responseTime' },
          avgConfidence: { $avg: '$metadata.confidence' }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          events: {
            $push: {
              type: '$_id.eventType',
              count: '$count',
              avgResponseTime: '$avgResponseTime',
              avgConfidence: '$avgConfidence'
            }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
    ];

    const results = await AnalyticsEvent.aggregate(pipeline);

    // Transform to chart-friendly format
    return results.map(r => {
      const date = new Date(
        r._id.year,
        (r._id.month || 1) - 1,
        r._id.day || 1,
        r._id.hour || 0
      );

      const dataPoint: any = {
        timestamp: date.toISOString(),
        date: date.toLocaleDateString(),
      };

      r.events.forEach((e: any) => {
        dataPoint[e.type] = e.count;
        if (e.avgResponseTime) {
          dataPoint[`${e.type}_responseTime`] = Math.round(e.avgResponseTime);
        }
        if (e.avgConfidence) {
          dataPoint[`${e.type}_confidence`] = Math.round(e.avgConfidence);
        }
      });

      // Fill in zeros for missing event types
      eventTypes.forEach(type => {
        if (!dataPoint[type]) dataPoint[type] = 0;
      });

      return dataPoint;
    });
  }

  // Get top queries
  async getTopQueries(days: number = 30, limit: number = 10): Promise<Array<{
    query: string;
    count: number;
    avgConfidence: number;
    avgResponseTime: number;
  }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return AnalyticsEvent.aggregate([
      {
        $match: {
          eventType: 'search',
          timestamp: { $gte: startDate },
          'metadata.query': { $exists: true, $ne: '' }
        }
      },
      {
        $group: {
          _id: { $toLower: '$metadata.query' },
          count: { $sum: 1 },
          avgConfidence: { $avg: '$metadata.confidence' },
          avgResponseTime: { $avg: '$metadata.responseTime' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          query: '$_id',
          count: 1,
          avgConfidence: { $round: ['$avgConfidence', 0] },
          avgResponseTime: { $round: ['$avgResponseTime', 0] }
        }
      }
    ]);
  }

  // Get top documents by views
  async getTopDocuments(days: number = 30, limit: number = 10): Promise<Array<{
    documentId: string;
    documentName: string;
    views: number;
    searches: number;
  }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analyticsData = await AnalyticsEvent.aggregate([
      {
        $match: {
          eventType: { $in: ['document_view', 'search'] },
          timestamp: { $gte: startDate },
          'metadata.documentId': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$metadata.documentId',
          documentName: { $first: '$metadata.documentName' },
          views: { $sum: { $cond: [{ $eq: ['$eventType', 'document_view'] }, 1, 0] } },
          searches: { $sum: { $cond: [{ $eq: ['$eventType', 'search'] }, 1, 0] } }
        }
      },
      { $sort: { views: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          documentId: '$_id',
          documentName: 1,
          views: 1,
          searches: 1
        }
      }
    ]);

    // If no analytics data, fall back to documents from the database
    if (analyticsData.length === 0) {
      const documents = await DocumentModel.find({})
        .sort({ uploadedAt: -1 })
        .limit(limit)
        .select('id originalName chunkCount')
        .lean();

      return documents.map((doc: any) => ({
        documentId: doc.id,
        documentName: doc.originalName,
        views: doc.chunkCount || 0, // Use chunk count as a proxy for "activity"
        searches: 0
      }));
    }

    return analyticsData;
  }

  // Get hourly activity heatmap data
  async getActivityHeatmap(days: number = 30): Promise<Array<{
    day: number;
    hour: number;
    count: number;
  }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return AnalyticsEvent.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: {
            dayOfWeek: { $dayOfWeek: '$timestamp' },
            hour: { $hour: '$timestamp' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          day: '$_id.dayOfWeek',
          hour: '$_id.hour',
          count: 1
        }
      },
      { $sort: { day: 1, hour: 1 } }
    ]);
  }

  // Get file type distribution
  async getFileTypeDistribution(days: number = 30): Promise<Array<{
    type: string;
    count: number;
    totalSize: number;
  }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analyticsData = await AnalyticsEvent.aggregate([
      {
        $match: {
          eventType: 'document_upload',
          timestamp: { $gte: startDate },
          'metadata.fileType': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$metadata.fileType',
          count: { $sum: 1 },
          totalSize: { $sum: '$metadata.fileSize' }
        }
      },
      {
        $project: {
          _id: 0,
          type: '$_id',
          count: 1,
          totalSize: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    // If no analytics data, fall back to documents from the database
    if (analyticsData.length === 0) {
      const documents = await DocumentModel.aggregate([
        {
          $addFields: {
            fileType: {
              $toLower: {
                $arrayElemAt: [
                  { $split: ['$originalName', '.'] },
                  -1
                ]
              }
            }
          }
        },
        {
          $group: {
            _id: '$fileType',
            count: { $sum: 1 },
            totalSize: { $sum: '$fileSize' }
          }
        },
        {
          $project: {
            _id: 0,
            type: '$_id',
            count: 1,
            totalSize: { $ifNull: ['$totalSize', 0] }
          }
        },
        { $sort: { count: -1 } }
      ]);

      return documents;
    }

    return analyticsData;
  }

  // Get response time percentiles
  async getResponseTimePercentiles(days: number = 30): Promise<{
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
    avg: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await AnalyticsEvent.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
          'metadata.responseTime': { $exists: true, $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          responseTimes: { $push: '$metadata.responseTime' },
          avg: { $avg: '$metadata.responseTime' }
        }
      },
      {
        $project: {
          _id: 0,
          responseTimes: { $sortArray: { input: '$responseTimes', sortBy: 1 } },
          avg: 1,
          count: { $size: '$responseTimes' }
        }
      }
    ]);

    if (!results.length || !results[0].responseTimes.length) {
      return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, avg: 0 };
    }

    const times = results[0].responseTimes;
    const count = times.length;

    const percentile = (p: number) => {
      const index = Math.ceil((p / 100) * count) - 1;
      return Math.round(times[Math.max(0, index)]);
    };

    return {
      p50: percentile(50),
      p75: percentile(75),
      p90: percentile(90),
      p95: percentile(95),
      p99: percentile(99),
      avg: Math.round(results[0].avg)
    };
  }

  // Get confidence score distribution
  async getConfidenceDistribution(days: number = 30): Promise<Array<{
    range: string;
    count: number;
    percentage: number;
  }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await AnalyticsEvent.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
          'metadata.confidence': { $exists: true }
        }
      },
      {
        $bucket: {
          groupBy: '$metadata.confidence',
          boundaries: [0, 20, 40, 60, 80, 101],
          default: 'Other',
          output: { count: { $sum: 1 } }
        }
      }
    ]);

    const total = results.reduce((sum, r) => sum + r.count, 0);
    const ranges = ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%'];

    return results
      .filter(r => r._id !== 'Other')
      .map((r, i) => ({
        range: ranges[i] || `${r._id}%+`,
        count: r.count,
        percentage: total > 0 ? Math.round((r.count / total) * 100) : 0
      }));
  }

  // Get real-time stats (last 5 minutes)
  async getRealTimeStats(): Promise<{
    activeUsers: number;
    searchesPerMinute: number;
    avgResponseTime: number;
    recentEvents: Array<{
      type: string;
      timestamp: Date;
      metadata: any;
    }>;
  }> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    const [activeUsers, searchesLastMinute, avgResponseTime, recentEvents] = await Promise.all([
      // Active users (unique sessions in last 5 min)
      AnalyticsEvent.distinct('sessionId', { timestamp: { $gte: fiveMinutesAgo } }),
      // Searches in last minute
      AnalyticsEvent.countDocuments({
        eventType: 'search',
        timestamp: { $gte: oneMinuteAgo }
      }),
      // Average response time in last 5 min
      AnalyticsEvent.aggregate([
        {
          $match: {
            timestamp: { $gte: fiveMinutesAgo },
            'metadata.responseTime': { $exists: true }
          }
        },
        { $group: { _id: null, avg: { $avg: '$metadata.responseTime' } } }
      ]),
      // Recent events
      AnalyticsEvent.find({ timestamp: { $gte: fiveMinutesAgo } })
        .sort({ timestamp: -1 })
        .limit(20)
        .select('eventType timestamp metadata')
        .lean()
    ]);

    return {
      activeUsers: activeUsers.length,
      searchesPerMinute: searchesLastMinute,
      avgResponseTime: avgResponseTime[0]?.avg ? Math.round(avgResponseTime[0].avg) : 0,
      recentEvents: recentEvents.map(e => ({
        type: e.eventType,
        timestamp: e.timestamp,
        metadata: e.metadata
      }))
    };
  }

  // GPT-4o/GPT-5 Pricing (per 1M tokens)
  private static readonly GPT_INPUT_COST_PER_1M = 2.50;   // $2.50 per 1M input tokens
  private static readonly GPT_OUTPUT_COST_PER_1M = 10.00; // $10.00 per 1M output tokens

  // Calculate cost from tokens (when estimatedCost is not stored)
  private calculateCostFromTokens(
    totalTokens: number,
    promptTokens: number = 0,
    completionTokens: number = 0
  ): number {
    // If we have prompt/completion breakdown, use it
    if (promptTokens > 0 || completionTokens > 0) {
      const inputCost = (promptTokens / 1_000_000) * AnalyticsService.GPT_INPUT_COST_PER_1M;
      const outputCost = (completionTokens / 1_000_000) * AnalyticsService.GPT_OUTPUT_COST_PER_1M;
      return inputCost + outputCost;
    }

    // Otherwise estimate using typical mix (70% input, 30% output)
    const estimatedInputTokens = totalTokens * 0.7;
    const estimatedOutputTokens = totalTokens * 0.3;
    const inputCost = (estimatedInputTokens / 1_000_000) * AnalyticsService.GPT_INPUT_COST_PER_1M;
    const outputCost = (estimatedOutputTokens / 1_000_000) * AnalyticsService.GPT_OUTPUT_COST_PER_1M;
    return inputCost + outputCost;
  }

  // Get bifurcated cost stats (chat vs training)
  async getCostStats(days: number = 30): Promise<{
    chat: {
      totalTokens: number;
      promptTokens: number;
      completionTokens: number;
      estimatedCost: number;
      requestCount: number;
    };
    training: {
      totalTokens: number;
      promptTokens: number;
      completionTokens: number;
      estimatedCost: number;
      requestCount: number;
      byFeature: {
        explain: { tokens: number; cost: number; count: number };
        flashcards: { tokens: number; cost: number; count: number };
        quiz: { tokens: number; cost: number; count: number };
        audio: { tokens: number; cost: number; count: number };
      };
    };
    total: {
      totalTokens: number;
      estimatedCost: number;
      requestCount: number;
    };
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get chat AI usage (where aiSource is 'chat' or null/undefined for legacy data)
    const chatStats = await AnalyticsEvent.aggregate([
      {
        $match: {
          eventType: 'ai_response',
          timestamp: { $gte: startDate },
          $or: [
            { 'metadata.aiSource': 'chat' },
            { 'metadata.aiSource': { $exists: false } },
            { 'metadata.aiSource': null }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: { $ifNull: ['$metadata.tokensUsed', 0] } },
          promptTokens: { $sum: { $ifNull: ['$metadata.promptTokens', 0] } },
          completionTokens: { $sum: { $ifNull: ['$metadata.completionTokens', 0] } },
          storedCost: { $sum: { $ifNull: ['$metadata.estimatedCost', 0] } },
          requestCount: { $sum: 1 }
        }
      }
    ]);

    // Get training AI usage
    const trainingStats = await AnalyticsEvent.aggregate([
      {
        $match: {
          eventType: 'ai_response',
          timestamp: { $gte: startDate },
          'metadata.aiSource': 'training'
        }
      },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: { $ifNull: ['$metadata.tokensUsed', 0] } },
          promptTokens: { $sum: { $ifNull: ['$metadata.promptTokens', 0] } },
          completionTokens: { $sum: { $ifNull: ['$metadata.completionTokens', 0] } },
          storedCost: { $sum: { $ifNull: ['$metadata.estimatedCost', 0] } },
          requestCount: { $sum: 1 }
        }
      }
    ]);

    // Get training stats by feature
    const trainingByFeature = await AnalyticsEvent.aggregate([
      {
        $match: {
          eventType: 'ai_response',
          timestamp: { $gte: startDate },
          'metadata.aiSource': 'training',
          'metadata.aiFeature': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$metadata.aiFeature',
          tokens: { $sum: { $ifNull: ['$metadata.tokensUsed', 0] } },
          cost: { $sum: { $ifNull: ['$metadata.estimatedCost', 0] } },
          count: { $sum: 1 }
        }
      }
    ]);

    // Build feature breakdown
    const featureBreakdown: any = {
      explain: { tokens: 0, cost: 0, count: 0 },
      flashcards: { tokens: 0, cost: 0, count: 0 },
      quiz: { tokens: 0, cost: 0, count: 0 },
      audio: { tokens: 0, cost: 0, count: 0 }
    };

    trainingByFeature.forEach((item: any) => {
      if (featureBreakdown[item._id]) {
        featureBreakdown[item._id] = {
          tokens: item.tokens,
          cost: item.cost,
          count: item.count
        };
      }
    });

    const chat = chatStats[0] || {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      storedCost: 0,
      requestCount: 0
    };

    const training = trainingStats[0] || {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      storedCost: 0,
      requestCount: 0
    };

    // Calculate cost from tokens if stored cost is 0 (for backwards compatibility)
    const chatCost = chat.storedCost > 0
      ? chat.storedCost
      : this.calculateCostFromTokens(chat.totalTokens, chat.promptTokens, chat.completionTokens);

    const trainingCost = training.storedCost > 0
      ? training.storedCost
      : this.calculateCostFromTokens(training.totalTokens, training.promptTokens, training.completionTokens);

    // Also recalculate feature costs if needed
    for (const feature of Object.keys(featureBreakdown)) {
      const f = featureBreakdown[feature];
      if (f.cost === 0 && f.tokens > 0) {
        f.cost = this.calculateCostFromTokens(f.tokens, 0, 0);
      }
    }

    return {
      chat: {
        totalTokens: chat.totalTokens,
        promptTokens: chat.promptTokens,
        completionTokens: chat.completionTokens,
        estimatedCost: Math.round(chatCost * 10000) / 10000,
        requestCount: chat.requestCount
      },
      training: {
        totalTokens: training.totalTokens,
        promptTokens: training.promptTokens,
        completionTokens: training.completionTokens,
        estimatedCost: Math.round(trainingCost * 10000) / 10000,
        requestCount: training.requestCount,
        byFeature: featureBreakdown
      },
      total: {
        totalTokens: chat.totalTokens + training.totalTokens,
        estimatedCost: Math.round((chatCost + trainingCost) * 10000) / 10000,
        requestCount: chat.requestCount + training.requestCount
      }
    };
  }
}

export const analyticsService = new AnalyticsService();
