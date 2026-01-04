import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  MessageSquare,
  Upload,
  FileText,
  Clock,
  Target,
  Zap,
  Users,
  RefreshCw,
  Calendar
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { StatsCard } from './StatsCard';
import { RealTimeStats } from './RealTimeStats';
import { TopDocumentsList } from './TopDocumentsList';
import { RecentActivity } from './RecentActivity';
import { ActivityChart } from './charts/ActivityChart';
import { TopQueriesChart } from './charts/TopQueriesChart';
import { ResponseTimeChart } from './charts/ResponseTimeChart';
import { FileTypesChart } from './charts/FileTypesChart';
import { ActivityHeatmap } from './charts/ActivityHeatmap';
import { ConfidenceChart } from './charts/ConfidenceChart';
import { analyticsApi, OverviewStats } from '../../services/analyticsApi';

const timeRanges = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 }
];

export function AnalyticsDashboard(): JSX.Element {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchOverview = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await analyticsApi.getOverview(days);
      setOverview(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch overview:', error);
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleRefresh = () => {
    fetchOverview();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">
            Analytics Dashboard
          </h1>
          <p className="text-sm text-secondary-500 dark:text-secondary-400 mt-1">
            Monitor your knowledge base usage and performance
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <div className="flex bg-secondary-100 dark:bg-secondary-800 rounded-lg p-1">
            {timeRanges.map(range => (
              <button
                key={range.value}
                onClick={() => setDays(range.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  days === range.value
                    ? 'bg-white dark:bg-secondary-700 text-primary-600 shadow-sm'
                    : 'text-secondary-500 hover:text-secondary-700 dark:hover:text-secondary-300'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </motion.button>
        </div>
      </div>

      {/* Last Updated */}
      <div className="flex items-center gap-2 text-xs text-secondary-400">
        <Calendar className="w-3 h-3" />
        <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Total Searches"
          value={overview?.totalSearches ?? 0}
          icon={Search}
          trend={overview?.trends.searches}
          color="primary"
        />
        <StatsCard
          title="Chat Messages"
          value={overview?.totalChats ?? 0}
          icon={MessageSquare}
          trend={overview?.trends.chats}
          color="success"
        />
        <StatsCard
          title="Documents Uploaded"
          value={overview?.totalUploads ?? 0}
          icon={Upload}
          trend={overview?.trends.uploads}
          color="warning"
        />
        <StatsCard
          title="Total Documents"
          value={overview?.totalDocuments ?? 0}
          icon={FileText}
          color="info"
        />
      </div>

      {/* Performance Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          title="Avg Response Time"
          value={overview?.avgResponseTime ?? 0}
          icon={Clock}
          suffix="ms"
          color="secondary"
          size="sm"
        />
        <StatsCard
          title="Avg Confidence"
          value={(overview?.avgConfidence ?? 0) * 100}
          icon={Target}
          suffix="%"
          color="success"
          size="sm"
        />
        <StatsCard
          title="Tokens Used"
          value={overview?.totalTokensUsed ?? 0}
          icon={Zap}
          color="warning"
          size="sm"
        />
        <StatsCard
          title="Unique Sessions"
          value={overview?.uniqueSessions ?? 0}
          icon={Users}
          color="info"
          size="sm"
        />
      </div>

      {/* Real-time Stats */}
      <RealTimeStats />

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityChart days={days} />
        <TopQueriesChart days={days} />
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ResponseTimeChart days={days} />
        <FileTypesChart days={days} />
        <ConfidenceChart days={days} />
      </div>

      {/* Activity Heatmap */}
      <ActivityHeatmap days={days} />

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopDocumentsList days={days} />
        <RecentActivity />
      </div>

      {/* Error Rate Warning */}
      {overview && overview.errorRate > 5 && (
        <Card className="border-danger-500 bg-danger-50 dark:bg-danger-900/20">
          <CardHeader>
            <h3 className="text-danger-600 dark:text-danger-400 font-semibold">
              ⚠️ High Error Rate Detected
            </h3>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-danger-600 dark:text-danger-400">
              Your error rate is currently at {overview.errorRate.toFixed(1)}%. 
              Consider checking your logs for issues.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AnalyticsDashboard;
