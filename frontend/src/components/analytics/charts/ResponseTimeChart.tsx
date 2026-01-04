import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine
} from 'recharts';
import { Clock, Loader, Zap } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../ui/Card';
import { analyticsApi, ResponseTimePercentiles } from '../../../services/analyticsApi';

interface ResponseTimeChartProps {
  days: number;
}

export function ResponseTimeChart({ days }: ResponseTimeChartProps): JSX.Element {
  const [data, setData] = useState<ResponseTimePercentiles | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const result = await analyticsApi.getResponseTimes(days);
        setData(result);
      } catch (error) {
        console.error('Failed to fetch response times:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [days]);

  const chartData = data ? [
    { name: 'P50', value: data.p50, color: '#10b981', label: 'Median' },
    { name: 'P75', value: data.p75, color: '#6366f1', label: '75th %' },
    { name: 'P90', value: data.p90, color: '#f59e0b', label: '90th %' },
    { name: 'P95', value: data.p95, color: '#ef4444', label: '95th %' },
    { name: 'P99', value: data.p99, color: '#dc2626', label: '99th %' }
  ] : [];

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
          {item.label}
        </p>
        <p className="text-lg font-bold" style={{ color: item.color }}>
          {item.value}ms
        </p>
      </motion.div>
    );
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-500" />
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
              Response Time Percentiles
            </h3>
          </div>
          {data && (
            <div className="flex items-center gap-1 text-sm">
              <Zap className="w-4 h-4 text-success-500" />
              <span className="text-secondary-500">Avg:</span>
              <span className="font-medium text-secondary-900 dark:text-white">{data.avg}ms</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader className="w-6 h-6 text-primary-500 animate-spin" />
          </div>
        ) : !data || data.avg === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-secondary-400">
            <Clock className="w-12 h-12 mb-2 opacity-50" />
            <p>No performance data yet</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}ms`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }} />
                <ReferenceLine y={data.avg} stroke="#9ca3af" strokeDasharray="3 3" />
                <Bar
                  dataKey="value"
                  radius={[4, 4, 0, 0]}
                  animationDuration={1000}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            
            {/* Performance indicators */}
            <div className="flex justify-center gap-4 mt-4">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-success-500" />
                <span className="text-xs text-secondary-500">Good (&lt;500ms)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-warning-500" />
                <span className="text-xs text-secondary-500">Moderate</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-danger-500" />
                <span className="text-xs text-secondary-500">Slow (&gt;1s)</span>
              </div>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
