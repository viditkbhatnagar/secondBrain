import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Search, Loader } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../ui/Card';
import { analyticsApi, TopQuery } from '../../../services/analyticsApi';

interface TopQueriesChartProps {
  days: number;
}

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'];

export function TopQueriesChart({ days }: TopQueriesChartProps): JSX.Element {
  const [data, setData] = useState<TopQuery[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const result = await analyticsApi.getTopQueries(days, 5);
        setData(result);
      } catch (error) {
        console.error('Failed to fetch top queries:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [days]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const item = payload[0].payload;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl border border-secondary-200 dark:border-secondary-700 p-3"
      >
        <p className="text-sm font-medium text-secondary-900 dark:text-white mb-2 max-w-[200px] truncate">
          "{item.query}"
        </p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-secondary-500">Count:</span>
            <span className="font-medium text-secondary-900 dark:text-white">{item.count}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-secondary-500">Avg Confidence:</span>
            <span className="font-medium text-secondary-900 dark:text-white">{item.avgConfidence}%</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-secondary-500">Avg Response:</span>
            <span className="font-medium text-secondary-900 dark:text-white">{item.avgResponseTime}ms</span>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-primary-500" />
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
            Top Queries
          </h3>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader className="w-6 h-6 text-primary-500 animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-secondary-400">
            <Search className="w-12 h-12 mb-2 opacity-50" />
            <p>No search data yet</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="query"
                  width={100}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    value.length > 15 ? `${value.slice(0, 15)}...` : value
                  }
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }} />
                <Bar
                  dataKey="count"
                  radius={[0, 4, 4, 0]}
                  animationDuration={1000}
                >
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
