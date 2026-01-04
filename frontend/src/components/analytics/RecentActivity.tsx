import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  Search, MessageSquare, Upload, Eye, Trash2,
  AlertCircle, Clock, ChevronRight
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { analyticsApi } from '../../services/analyticsApi';

interface ActivityEvent {
  type: string;
  timestamp: string;
  metadata: any;
}

const eventIcons: Record<string, any> = {
  search: { icon: Search, color: 'text-primary-500', bg: 'bg-primary-100 dark:bg-primary-900/30' },
  chat_message: { icon: MessageSquare, color: 'text-success-500', bg: 'bg-success-100 dark:bg-success-900/30' },
  document_upload: { icon: Upload, color: 'text-warning-500', bg: 'bg-warning-100 dark:bg-warning-900/30' },
  document_view: { icon: Eye, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  document_delete: { icon: Trash2, color: 'text-danger-500', bg: 'bg-danger-100 dark:bg-danger-900/30' },
  error: { icon: AlertCircle, color: 'text-danger-500', bg: 'bg-danger-100 dark:bg-danger-900/30' }
};

const getEventDescription = (event: ActivityEvent): string => {
  switch (event.type) {
    case 'search':
      return `Searched: "${event.metadata?.query?.slice(0, 50) || 'Unknown'}${event.metadata?.query?.length > 50 ? '...' : ''}"`;
    case 'chat_message':
      return 'Sent a chat message';
    case 'document_upload':
      return `Uploaded: ${event.metadata?.documentName || 'document'}`;
    case 'document_view':
      return `Viewed: ${event.metadata?.documentName || 'document'}`;
    case 'document_delete':
      return `Deleted: ${event.metadata?.documentName || 'document'}`;
    case 'error':
      return `Error: ${event.metadata?.errorType || 'Unknown error'}`;
    default:
      return event.type;
  }
};

export function RecentActivity(): JSX.Element {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const fetchEvents = async () => {
      try {
        const data = await analyticsApi.getRealTime();
        if (mounted) {
          setEvents(data.recentEvents || []);
        }
      } catch (error) {
        console.error('Failed to fetch recent activity:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchEvents();
    // Refresh every 60 seconds instead of 10 to reduce load
    const interval = setInterval(fetchEvents, 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-500" />
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
              Recent Activity
            </h3>
          </div>
          <span className="text-xs text-secondary-400">Last 5 minutes</span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="w-8 h-8 bg-secondary-200 dark:bg-secondary-700 rounded-lg" />
                <div className="flex-1">
                  <div className="h-3 bg-secondary-200 dark:bg-secondary-700 rounded w-3/4 mb-1" />
                  <div className="h-2 bg-secondary-200 dark:bg-secondary-700 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-secondary-400">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            <AnimatePresence mode="popLayout">
              {events.map((event, index) => {
                const eventConfig = eventIcons[event.type] || eventIcons.search;
                const Icon = eventConfig.icon;

                return (
                  <motion.div
                    key={`${event.timestamp}-${index}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary-50 dark:hover:bg-secondary-800/50 transition-colors group"
                  >
                    <div className={`w-8 h-8 rounded-lg ${eventConfig.bg} flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${eventConfig.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-secondary-700 dark:text-secondary-300 truncate">
                        {getEventDescription(event)}
                      </p>
                      <p className="text-xs text-secondary-400">
                        {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-secondary-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
