import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useOffline } from '../../contexts/OfflineContext';
import { Button } from '../ui/Button';

interface UpdatePromptProps {
  show: boolean;
  onDismiss: () => void;
}

export function UpdatePrompt({ show, onDismiss }: UpdatePromptProps): JSX.Element | null {
  const { updateApp } = useOffline();

  const handleUpdate = () => {
    updateApp();
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-50 bg-primary-600 text-white px-4 py-3 shadow-lg"
        >
          <div className="container mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5" />
              <div>
                <p className="font-medium text-sm">Update available</p>
                <p className="text-xs text-primary-200">
                  A new version is ready to install
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="text-white hover:bg-white/20"
              >
                Later
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleUpdate}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Update
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
