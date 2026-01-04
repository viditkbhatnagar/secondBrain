import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Loader } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../../ui/Card';
import { analyticsApi, HeatmapData } from '../../../services/analyticsApi';

interface ActivityHeatmapProps {
  days: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function ActivityHeatmap({ days }: ActivityHeatmapProps): JSX.Element {
  const [data, setData] = useState<HeatmapData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<{ day: number; hour: number } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const result = await analyticsApi.getHeatmap(days);
        setData(result);
      } catch (error) {
        console.error('Failed to fetch heatmap data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [days]);

  // Create a map for quick lookup
  const dataMap = new Map<string, number>();
  let maxCount = 0;
  data.forEach(d => {
    dataMap.set(`${d.day}-${d.hour}`, d.count);
    maxCount = Math.max(maxCount, d.count);
  });

  const getColor = (count: number): string => {
    if (count === 0) return 'bg-secondary-100 dark:bg-secondary-800';
    const intensity = count / maxCount;
    if (intensity < 0.2) return 'bg-primary-100 dark:bg-primary-900/30';
    if (intensity < 0.4) return 'bg-primary-200 dark:bg-primary-800/50';
    if (intensity < 0.6) return 'bg-primary-300 dark:bg-primary-700/70';
    if (intensity < 0.8) return 'bg-primary-400 dark:bg-primary-600';
    return 'bg-primary-500 dark:bg-primary-500';
  };

  const getCount = (day: number, hour: number): number => {
    return dataMap.get(`${day}-${hour}`) || 0;
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary-500" />
          <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
            Activity Heatmap
          </h3>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader className="w-6 h-6 text-primary-500 animate-spin" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="overflow-x-auto"
          >
            <div className="min-w-[300px]">
              {/* Hour labels */}
              <div className="flex mb-1">
                <div className="w-10" />
                {HOURS.filter((_, i) => i % 6 === 0).map(hour => (
                  <div
                    key={hour}
                    className="text-[10px] text-secondary-400 text-center"
                    style={{ width: `${100 / 4}%` }}
                  >
                    {hour}:00
                  </div>
                ))}
              </div>

              {/* Heatmap grid */}
              {DAYS.map((dayName, dayIndex) => (
                <div key={dayName} className="flex items-center mb-1">
                  <div className="w-10 text-xs text-secondary-500 pr-2 text-right">
                    {dayName}
                  </div>
                  <div className="flex-1 flex gap-0.5">
                    {HOURS.map(hour => {
                      const count = getCount(dayIndex + 1, hour);
                      const isHovered = hoveredCell?.day === dayIndex && hoveredCell?.hour === hour;
                      
                      return (
                        <div
                          key={hour}
                          className="relative"
                          style={{ width: `${100 / 24}%` }}
                        >
                          <div
                            className={`aspect-square rounded-sm cursor-pointer transition-colors duration-150 ${getColor(count)} ${
                              isHovered ? 'ring-2 ring-primary-500 ring-offset-1 z-10' : ''
                            }`}
                            onMouseEnter={() => setHoveredCell({ day: dayIndex, hour })}
                            onMouseLeave={() => setHoveredCell(null)}
                            title={`${dayName} ${hour}:00 - ${count} events`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div className="flex items-center justify-end gap-2 mt-4">
                <span className="text-xs text-secondary-400">Less</span>
                <div className="flex gap-0.5">
                  {['bg-secondary-100 dark:bg-secondary-800', 'bg-primary-200 dark:bg-primary-800/50', 'bg-primary-300 dark:bg-primary-700/70', 'bg-primary-400 dark:bg-primary-600', 'bg-primary-500'].map((color, i) => (
                    <div key={i} className={`w-3 h-3 rounded-sm ${color}`} />
                  ))}
                </div>
                <span className="text-xs text-secondary-400">More</span>
              </div>

              {/* Tooltip - fixed position to prevent layout shift */}
              <div className="mt-2 h-6 text-center text-sm text-secondary-600 dark:text-secondary-300">
                {hoveredCell ? (
                  <span>
                    {DAYS[hoveredCell.day]} at {hoveredCell.hour}:00 — {getCount(hoveredCell.day + 1, hoveredCell.hour)} events
                  </span>
                ) : (
                  <span className="text-secondary-400">Hover over cells to see details</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
