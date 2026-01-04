import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { Activity, Loader } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../ui/Card';
import { analyticsApi, TimeSeriesDataPoint } from '../../../services/analyticsApi';

interface ActivityChartProps {
  days: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl border border-secondary-200 dark:border-secondary-700 p-3"
    >
      <p className="text-sm font-medium text-secondary-900 dark:text-white mb-2">{label}</p>
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-secondary-600 dark:text-secondary-400">
            {entry.name}:
          </span>
          <span className="font-medium text-secondary-900 dark:text-white">
            {entry.value}
          </span>
        </div>
      ))}
    </motion.div>
  );
};

export function ActivityChart({ days }: ActivityChartProps): JSX.Element {
  const [data, setData] = useState<TimeSeriesDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [granularity, setGranularity] = useState<'hour' | 'day' | 'week'>('day');

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const result = await analyticsApi.getTimeSeries(days, granularity);
        setData(result);
      } catch (error) {
        console.error('Failed to fetch time series:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [days, granularity]);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary-500" />
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
            Activity Overview
          </h3>
        </div>
        <div className="flex bg-secondary-100 dark:bg-secondary-800 rounded-lg p-1">
          {(['hour', 'day', 'week'] as const).map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-2 py-1 text-xs font-medium rounded transition-all ${
                granularity === g
                  ? 'bg-white dark:bg-secondary-700 text-primary-600 shadow-sm'
                  : 'text-secondary-500 hover:text-secondary-700'
              }`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader className="w-6 h-6 text-primary-500 animate-spin" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="searchGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="chatGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="uploadGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  stroke="#9ca3af"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  stroke="#9ca3af"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="circle"
                  iconSize={8}
                />
                <Area
                  type="monotone"
                  dataKey="search"
                  name="Searches"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#searchGradient)"
                  animationDuration={1000}
                />
                <Area
                  type="monotone"
                  dataKey="chat_message"
                  name="Chats"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#chatGradient)"
                  animationDuration={1200}
                />
                <Area
                  type="monotone"
                  dataKey="document_upload"
                  name="Uploads"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#uploadGradient)"
                  animationDuration={1400}
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
