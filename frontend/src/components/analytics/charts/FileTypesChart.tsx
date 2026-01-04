import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';
import { FileText, Loader } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../ui/Card';
import { analyticsApi, FileTypeData } from '../../../services/analyticsApi';

interface FileTypesChartProps {
  days: number;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const fileTypeLabels: Record<string, string> = {
  pdf: 'PDF',
  txt: 'Text',
  md: 'Markdown',
  docx: 'Word',
  json: 'JSON',
  csv: 'CSV'
};

export function FileTypesChart({ days }: FileTypesChartProps): JSX.Element {
  const [data, setData] = useState<FileTypeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const result = await analyticsApi.getFileTypes(days);
        setData(result);
      } catch (error) {
        console.error('Failed to fetch file types:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [days]);

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const total = data.reduce((sum, item) => sum + item.count, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const item = payload[0].payload;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white dark:bg-secondary-800 rounded-lg shadow-xl border border-secondary-200 dark:border-secondary-700 p-3"
      >
        <p className="text-sm font-medium text-secondary-900 dark:text-white mb-2">
          {fileTypeLabels[item.type] || item.type.toUpperCase()}
        </p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-secondary-500">Files:</span>
            <span className="font-medium">{item.count}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-secondary-500">Total Size:</span>
            <span className="font-medium">{formatSize(item.totalSize)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-secondary-500">Percentage:</span>
            <span className="font-medium">{((item.count / total) * 100).toFixed(1)}%</span>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs font-medium"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary-500" />
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
            File Types
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
            <FileText className="w-12 h-12 mb-2 opacity-50" />
            <p>No upload data yet</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-64"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.map(d => ({
                    ...d,
                    name: fileTypeLabels[d.type] || d.type.toUpperCase()
                  }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="count"
                  labelLine={false}
                  label={renderCustomLabel}
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  animationDuration={1000}
                >
                  {data.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      stroke="none"
                      style={{
                        transform: activeIndex === index ? 'scale(1.05)' : 'scale(1)',
                        transformOrigin: 'center',
                        transition: 'transform 0.2s ease-out'
                      }}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-xs text-secondary-600 dark:text-secondary-400">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
