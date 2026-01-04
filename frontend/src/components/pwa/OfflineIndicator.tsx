import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi, CloudOff } from 'lucide-react';
import { useOffline } from '../../contexts/OfflineContext';

export function OfflineIndicator(): JSX.Element | null {
  const { isOnline } = useOffline();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 500 }}
          className="fixed top-0 left-0 right-0 z-50 bg-warning-500 text-white px-4 py-2 shadow-lg"
        >
          <div className="container mx-auto flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4" />
            <span className="text-sm font-medium">
              You're offline. Some features may be limited.
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Floating badge version
export function OfflineBadge(): JSX.Element | null {
  const { isOnline } = useOffline();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="fixed bottom-20 right-4 z-50 bg-warning-500 text-white px-3 py-2 rounded-full shadow-lg flex items-center gap-2"
        >
          <CloudOff className="w-4 h-4" />
          <span className="text-xs font-medium">Offline</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Reconnecting indicator
export function ReconnectingIndicator({ show }: { show: boolean }): JSX.Element | null {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-20 right-4 z-50 bg-primary-500 text-white px-3 py-2 rounded-full shadow-lg flex items-center gap-2"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          >
            <Wifi className="w-4 h-4" />
          </motion.div>
          <span className="text-xs font-medium">Reconnecting...</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
