import React from 'react';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import { TrendingUp, TrendingDown, LucideIcon } from 'lucide-react';
import { Card } from '../ui/Card';

interface StatsCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  trend?: number;
  suffix?: string;
  prefix?: string;
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md' | 'lg';
  description?: string;
}

const colorClasses = {
  primary: {
    bg: 'bg-primary-100 dark:bg-primary-900/30',
    icon: 'text-primary-600 dark:text-primary-400',
    gradient: 'from-primary-500 to-primary-600'
  },
  secondary: {
    bg: 'bg-secondary-100 dark:bg-secondary-800',
    icon: 'text-secondary-600 dark:text-secondary-400',
    gradient: 'from-secondary-500 to-secondary-600'
  },
  success: {
    bg: 'bg-success-100 dark:bg-success-900/30',
    icon: 'text-success-600 dark:text-success-400',
    gradient: 'from-success-500 to-success-600'
  },
  warning: {
    bg: 'bg-warning-100 dark:bg-warning-900/30',
    icon: 'text-warning-600 dark:text-warning-400',
    gradient: 'from-warning-500 to-warning-600'
  },
  danger: {
    bg: 'bg-danger-100 dark:bg-danger-900/30',
    icon: 'text-danger-600 dark:text-danger-400',
    gradient: 'from-danger-500 to-danger-600'
  },
  info: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    icon: 'text-blue-600 dark:text-blue-400',
    gradient: 'from-blue-500 to-blue-600'
  }
};

export function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  suffix = '',
  prefix = '',
  color = 'primary',
  size = 'md',
  description
}: StatsCardProps): JSX.Element {
  const colors = colorClasses[color];
  const isPositiveTrend = trend && trend > 0;

  const sizeClasses = {
    sm: { padding: 'p-4', iconSize: 'w-8 h-8', valueSize: 'text-xl', titleSize: 'text-xs' },
    md: { padding: 'p-5', iconSize: 'w-10 h-10', valueSize: 'text-2xl', titleSize: 'text-sm' },
    lg: { padding: 'p-6', iconSize: 'w-12 h-12', valueSize: 'text-3xl', titleSize: 'text-base' }
  };

  const sizes = sizeClasses[size];

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <Card className={`${sizes.padding} relative overflow-hidden group`}>
        {/* Background Gradient */}
        <div className={`absolute inset-0 bg-gradient-to-br ${colors.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />

        <div className="flex items-start justify-between relative">
          <div className="flex-1">
            <p className={`${sizes.titleSize} font-medium text-secondary-500 dark:text-secondary-400 mb-1`}>
              {title}
            </p>
            <div className="flex items-baseline gap-1">
              <span className={`${sizes.valueSize} font-bold text-secondary-900 dark:text-white`}>
                {prefix}
                <CountUp
                  end={value}
                  duration={1.5}
                  separator=","
                  decimals={suffix === '%' && value % 1 !== 0 ? 1 : 0}
                />
                {suffix}
              </span>
            </div>
            
            {/* Trend indicator */}
            {trend !== undefined && trend !== 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-1 mt-2"
              >
                {isPositiveTrend ? (
                  <TrendingUp className="w-4 h-4 text-success-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-danger-500" />
                )}
                <span className={`text-xs font-medium ${
                  isPositiveTrend ? 'text-success-600 dark:text-success-400' : 'text-danger-600 dark:text-danger-400'
                }`}>
                  {isPositiveTrend ? '+' : ''}{trend}%
                </span>
                <span className="text-xs text-secondary-400">vs last period</span>
              </motion.div>
            )}

            {description && (
              <p className="text-xs text-secondary-400 mt-1">{description}</p>
            )}
          </div>

          {/* Icon */}
          <div className={`${colors.bg} ${sizes.iconSize} rounded-xl flex items-center justify-center`}>
            <Icon className={`w-1/2 h-1/2 ${colors.icon}`} />
          </div>
        </div>

        {/* Sparkline placeholder */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </Card>
    </motion.div>
  );
}
