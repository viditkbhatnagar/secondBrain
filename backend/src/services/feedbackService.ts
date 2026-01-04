import { logger } from '../utils/logger';
import { redisService } from './RedisService';
import mongoose, { Schema, Document } from 'mongoose';

// Feedback document interface
interface IFeedback extends Document {
  queryId: string;
  query: string;
  answer: string;
  rating: 'positive' | 'negative';
  feedback?: string;
  sourceIds: string[];
  confidence: number;
  responseTime: number;
  createdAt: Date;
  processed: boolean;
}

// Feedback schema
const FeedbackSchema = new Schema<IFeedback>({
  queryId: { type: String, required: true, unique: true, index: true },
  query: { type: String, required: true, index: true },
  answer: { type: String, required: true },
  rating: { type: String, enum: ['positive', 'negative'], required: true, index: true },
  feedback: { type: String },
  sourceIds: [{ type: String }],
  confidence: { type: Number, required: true },
  responseTime: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now, index: true },
  processed: { type: Boolean, default: false, index: true }
});

// Create model
const FeedbackModel = mongoose.model<IFeedback>('Feedback', FeedbackSchema);

interface FeedbackData {
  queryId: string;
  query: string;
  answer: string;
  rating: 'positive' | 'negative';
  feedback?: string;
  sourceIds: string[];
  confidence: number;
  responseTime: number;
}

interface FeedbackStats {
  total: number;
  positive: number;
  negative: number;
  positiveRate: number;
  avgConfidencePositive: number;
  avgConfidenceNegative: number;
  commonIssues: string[];
}

/**
 * User Feedback Service
 * Collects and analyzes user feedback to improve RAG quality
 */
export class FeedbackService {
  private readonly CACHE_KEY_PREFIX = 'feedback:';

  /**
   * Record user feedback
   */
  async recordFeedback(data: FeedbackData): Promise<boolean> {
    try {
      await FeedbackModel.findOneAndUpdate(
        { queryId: data.queryId },
        {
          ...data,
          createdAt: new Date(),
          processed: false
        },
        { upsert: true, new: true }
      );

      // Update query quality cache
      await this.updateQueryQualityCache(data.query, data.rating);

      logger.info('Feedback recorded', {
        queryId: data.queryId,
        rating: data.rating,
        confidence: data.confidence
      });

      return true;
    } catch (error) {
      logger.error('Failed to record feedback:', error);
      return false;
    }
  }

  /**
   * Get feedback statistics
   */
  async getStats(days: number = 30): Promise<FeedbackStats> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
      const [stats, issues] = await Promise.all([
        FeedbackModel.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              positive: { $sum: { $cond: [{ $eq: ['$rating', 'positive'] }, 1, 0] } },
              negative: { $sum: { $cond: [{ $eq: ['$rating', 'negative'] }, 1, 0] } },
              avgConfidencePositive: {
                $avg: { $cond: [{ $eq: ['$rating', 'positive'] }, '$confidence', null] }
              },
              avgConfidenceNegative: {
                $avg: { $cond: [{ $eq: ['$rating', 'negative'] }, '$confidence', null] }
              }
            }
          }
        ]).exec(),
        this.getCommonIssues(startDate)
      ]);

      const result = stats[0] || {
        total: 0,
        positive: 0,
        negative: 0,
        avgConfidencePositive: 0,
        avgConfidenceNegative: 0
      };

      return {
        total: result.total,
        positive: result.positive,
        negative: result.negative,
        positiveRate: result.total > 0 ? result.positive / result.total : 0,
        avgConfidencePositive: result.avgConfidencePositive || 0,
        avgConfidenceNegative: result.avgConfidenceNegative || 0,
        commonIssues: issues
      };
    } catch (error) {
      logger.error('Failed to get feedback stats:', error);
      return {
        total: 0,
        positive: 0,
        negative: 0,
        positiveRate: 0,
        avgConfidencePositive: 0,
        avgConfidenceNegative: 0,
        commonIssues: []
      };
    }
  }

  /**
   * Get common issues from negative feedback
   */
  private async getCommonIssues(startDate: Date): Promise<string[]> {
    try {
      const negativeFeedback = await FeedbackModel.find({
        createdAt: { $gte: startDate },
        rating: 'negative',
        feedback: { $exists: true, $ne: '' }
      })
        .select('feedback')
        .limit(100)
        .lean();

      // Extract common keywords from feedback
      const keywords = new Map<string, number>();
      const stopWords = new Set(['the', 'a', 'an', 'is', 'was', 'not', 'it', 'to', 'and', 'of', 'in']);

      for (const fb of negativeFeedback) {
        const words = (fb.feedback || '')
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter((w: string) => w.length > 3 && !stopWords.has(w));

        for (const word of words) {
          keywords.set(word, (keywords.get(word) || 0) + 1);
        }
      }

      // Return top 5 issues
      return Array.from(keywords.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);

    } catch (error) {
      return [];
    }
  }

  /**
   * Update query quality cache for adaptive retrieval
   */
  private async updateQueryQualityCache(query: string, rating: 'positive' | 'negative'): Promise<void> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}quality:${this.hashQuery(query)}`;
    
    try {
      const existing = await redisService.get<{ positive: number; negative: number }>(cacheKey);
      const stats = existing || { positive: 0, negative: 0 };
      
      if (rating === 'positive') {
        stats.positive++;
      } else {
        stats.negative++;
      }

      await redisService.set(cacheKey, stats, 86400 * 30); // 30 days
    } catch (error) {
      // Ignore cache errors
    }
  }

  /**
   * Get query quality score (for adaptive retrieval)
   */
  async getQueryQuality(query: string): Promise<number> {
    const cacheKey = `${this.CACHE_KEY_PREFIX}quality:${this.hashQuery(query)}`;
    
    try {
      const stats = await redisService.get<{ positive: number; negative: number }>(cacheKey);
      if (!stats) return 0.5; // Default neutral

      const total = stats.positive + stats.negative;
      if (total === 0) return 0.5;

      return stats.positive / total;
    } catch {
      return 0.5;
    }
  }

  /**
   * Get queries that need improvement (low quality score)
   */
  async getQueriesNeedingImprovement(limit: number = 10): Promise<Array<{ query: string; rating: string; count: number }>> {
    try {
      const results = await FeedbackModel.aggregate([
        { $match: { rating: 'negative' } },
        {
          $group: {
            _id: '$query',
            count: { $sum: 1 },
            avgConfidence: { $avg: '$confidence' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: limit }
      ]).exec();

      return results.map((r: any) => ({
        query: r._id,
        rating: 'negative',
        count: r.count
      }));
    } catch (error) {
      logger.error('Failed to get queries needing improvement:', error);
      return [];
    }
  }

  /**
   * Check if similar query had negative feedback (for adaptive retrieval)
   */
  async shouldUseEnhancedRetrieval(query: string): Promise<boolean> {
    const quality = await this.getQueryQuality(query);
    // If quality is below 0.6, use enhanced retrieval
    return quality < 0.6;
  }

  private hashQuery(query: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(query.toLowerCase().trim()).digest('hex').slice(0, 16);
  }
}

export const feedbackService = new FeedbackService();
