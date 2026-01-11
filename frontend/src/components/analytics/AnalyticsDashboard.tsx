import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  MessageSquare,
  DollarSign,
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
import { TopDocumentsList } from './TopDocumentsList';
import { RecentActivity } from './RecentActivity';
import { ActivityChart } from './charts/ActivityChart';
import { TopQueriesChart } from './charts/TopQueriesChart';
import { ResponseTimeChart } from './charts/ResponseTimeChart';
import { FileTypesChart } from './charts/FileTypesChart';
import { ActivityHeatmap } from './charts/ActivityHeatmap';
import { ConfidenceChart } from './charts/ConfidenceChart';
import { analyticsApi, OverviewStats, CostStats } from '../../services/analyticsApi';
import { GraduationCap } from 'lucide-react';

const timeRanges = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 }
];

// Auto-refresh interval in milliseconds (30 seconds)
const AUTO_REFRESH_INTERVAL = 30000;

export function AnalyticsDashboard(): JSX.Element {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [costStats, setCostStats] = useState<CostStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchOverview = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const [overviewData, costsData] = await Promise.all([
        analyticsApi.getOverview(days),
        analyticsApi.getCosts(days)
      ]);
      setOverview(overviewData);
      setCostStats(costsData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [days]);

  // Initial fetch and auto-refresh setup
  useEffect(() => {
    fetchOverview();
    
    // Set up auto-refresh interval
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        fetchOverview(false); // Don't show loading spinner for auto-refresh
      }, AUTO_REFRESH_INTERVAL);
    }
    
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [fetchOverview, autoRefresh]);

  const handleRefresh = () => {
    fetchOverview();
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(prev => !prev);
  };  return (
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

          {/* Auto-refresh Toggle */}
          <button
            onClick={toggleAutoRefresh}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              autoRefresh
                ? 'bg-success-100 dark:bg-success-900/30 text-success-600 dark:text-success-400'
                : 'bg-secondary-100 dark:bg-secondary-800 text-secondary-500'
            }`}
            title={autoRefresh ? 'Auto-refresh ON (30s)' : 'Auto-refresh OFF'}
          >
            {autoRefresh ? 'Live' : 'Paused'}
          </button>

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
        {autoRefresh && (
          <span className="ml-2 flex items-center gap-1">
            <span className="w-2 h-2 bg-success-500 rounded-full animate-pulse" />
            <span>Auto-refreshing every 30s</span>
          </span>
        )}
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
          title="Total Documents"
          value={overview?.totalDocuments ?? 0}
          icon={FileText}
          color="info"
        />
        <StatsCard
          title="Unique Sessions"
          value={overview?.uniqueSessions ?? 0}
          icon={Users}
          color="secondary"
        />
      </div>

      {/* Cost Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard
          title="Chat Cost"
          value={costStats?.chat.estimatedCost ?? 0}
          icon={MessageSquare}
          prefix="$"
          decimals={4}
          color="primary"
          description={`${(costStats?.chat.totalTokens ?? 0).toLocaleString()} tokens`}
        />
        <StatsCard
          title="Training Cost"
          value={costStats?.training.estimatedCost ?? 0}
          icon={GraduationCap}
          prefix="$"
          decimals={4}
          color="success"
          description={`${(costStats?.training.totalTokens ?? 0).toLocaleString()} tokens`}
        />
        <StatsCard
          title="Total API Cost"
          value={costStats?.total.estimatedCost ?? 0}
          icon={DollarSign}
          prefix="$"
          decimals={4}
          color="warning"
          description={`${(costStats?.total.totalTokens ?? 0).toLocaleString()} tokens`}
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
          value={overview?.avgConfidence ?? 0}
          icon={Target}
          suffix="%"
          color="success"
          size="sm"
        />
        <StatsCard
          title="Chat Requests"
          value={costStats?.chat.requestCount ?? 0}
          icon={MessageSquare}
          color="primary"
          size="sm"
        />
        <StatsCard
          title="Training Requests"
          value={costStats?.training.requestCount ?? 0}
          icon={GraduationCap}
          color="success"
          size="sm"
        />
      </div>

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
