import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Users, Zap, Radio } from 'lucide-react';
import CountUp from 'react-countup';
import { analyticsApi, RealTimeStats as RealTimeStatsType } from '../../services/analyticsApi';

export function RealTimeStats(): JSX.Element {
  const [stats, setStats] = useState<RealTimeStatsType | null>(null);

  useEffect(() => {
    let mounted = true;
    
    const fetchStats = async () => {
      try {
        const data = await analyticsApi.getRealTime();
        if (mounted) {
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch real-time stats:', err);
      }
    };

    fetchStats();
    // Refresh every 30 seconds instead of 5 to reduce load
    const interval = setInterval(fetchStats, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-primary-500/10 via-primary-600/10 to-purple-500/10 dark:from-primary-500/20 dark:via-primary-600/20 dark:to-purple-500/20 rounded-xl p-4 border border-primary-200/50 dark:border-primary-700/50"
    >
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="relative"
          >
            <Radio className="w-5 h-5 text-success-500" />
            <div className="absolute inset-0 animate-ping">
              <Radio className="w-5 h-5 text-success-500 opacity-50" />
            </div>
          </motion.div>
          <span className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
            Real-time Activity
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 flex-wrap justify-center">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-500" />
            <span className="text-sm text-secondary-600 dark:text-secondary-400">Active Users:</span>
            <span className="text-lg font-bold text-secondary-900 dark:text-white">
              <CountUp end={stats?.activeUsers || 0} duration={0.5} />
            </span>
          </div>

          <div className="w-px h-6 bg-secondary-300 dark:bg-secondary-700 hidden sm:block" />

          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-success-500" />
            <span className="text-sm text-secondary-600 dark:text-secondary-400">Searches/min:</span>
            <span className="text-lg font-bold text-secondary-900 dark:text-white">
              <CountUp end={stats?.searchesPerMinute || 0} duration={0.5} />
            </span>
          </div>

          <div className="w-px h-6 bg-secondary-300 dark:bg-secondary-700 hidden sm:block" />

          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-warning-500" />
            <span className="text-sm text-secondary-600 dark:text-secondary-400">Avg Response:</span>
            <span className="text-lg font-bold text-secondary-900 dark:text-white">
              <CountUp end={stats?.avgResponseTime || 0} duration={0.5} suffix="ms" />
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
