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
import { Zap, Loader } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../ui/Card';
import { analyticsApi, ConfidenceDistribution } from '../../../services/analyticsApi';

interface ConfidenceChartProps {
  days: number;
}

const COLORS = ['#ef4444', '#f59e0b', '#eab308', '#84cc16', '#10b981'];

export function ConfidenceChart({ days }: ConfidenceChartProps): JSX.Element {
  const [data, setData] = useState<ConfidenceDistribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const result = await analyticsApi.getConfidenceDistribution(days);
        setData(result);
      } catch (error) {
        console.error('Failed to fetch confidence distribution:', error);
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
        <p className="text-sm font-medium text-secondary-900 dark:text-white">
          {item.range}
        </p>
        <p className="text-lg font-bold text-primary-600">
          {item.count} searches ({item.percentage}%)
        </p>
      </motion.div>
    );
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary-500" />
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
            Confidence Distribution
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
            <Zap className="w-12 h-12 mb-2 opacity-50" />
            <p>No confidence data yet</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }} />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  animationDuration={1000}
                >
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            
            {/* Legend */}
            <div className="flex justify-center gap-4 mt-4 flex-wrap">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-danger-500" />
                <span className="text-xs text-secondary-500">Low</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-warning-500" />
                <span className="text-xs text-secondary-500">Medium</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-success-500" />
                <span className="text-xs text-secondary-500">High</span>
              </div>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
