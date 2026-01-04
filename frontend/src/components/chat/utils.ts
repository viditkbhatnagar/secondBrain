import { ChatThread, GroupedThreads } from './types';

export const groupThreadsByDate = (threads: ChatThread[]): GroupedThreads => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const groups: GroupedThreads = {
    today: [],
    yesterday: [],
    previous7Days: [],
    previous30Days: [],
    older: [],
  };

  threads.forEach((thread) => {
    const threadDate = new Date(thread.updatedAt || thread.createdAt);
    if (threadDate >= today) {
      groups.today.push(thread);
    } else if (threadDate >= yesterday) {
      groups.yesterday.push(thread);
    } else if (threadDate >= sevenDaysAgo) {
      groups.previous7Days.push(thread);
    } else if (threadDate >= thirtyDaysAgo) {
      groups.previous30Days.push(thread);
    } else {
      groups.older.push(thread);
    }
  });

  return groups;
};

export const getThreadDisplayTitle = (thread: ChatThread): string => {
  if (thread.title && thread.title.trim()) {
    return thread.title;
  }
  return 'New Chat';
};

export const formatTime = (dateStr?: string): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};
