import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Monitor, Sparkles } from 'lucide-react';
import { useOffline } from '../../contexts/OfflineContext';
import { Button } from '../ui/Button';

export function InstallPrompt(): JSX.Element | null {
  const { canInstall, installApp, isPWAInstalled } = useOffline();
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Show prompt after 30 seconds if can install
    if (canInstall && !isPWAInstalled && !dismissed) {
      const timer = setTimeout(() => setShowPrompt(true), 30000);
      return () => clearTimeout(timer);
    }
  }, [canInstall, isPWAInstalled, dismissed]);

  // Check localStorage for previous dismissal
  useEffect(() => {
    const dismissedUntil = localStorage.getItem('pwa-prompt-dismissed');
    if (dismissedUntil && new Date(dismissedUntil) > new Date()) {
      setDismissed(true);
    }
  }, []);

  const handleInstall = async () => {
    const success = await installApp();
    if (success) {
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    // Don't show again for 7 days
    const dismissUntil = new Date();
    dismissUntil.setDate(dismissUntil.getDate() + 7);
    localStorage.setItem('pwa-prompt-dismissed', dismissUntil.toISOString());
  };

  if (!canInstall || isPWAInstalled || !showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50"
      >
        <div className="bg-white dark:bg-secondary-800 rounded-2xl shadow-2xl border border-secondary-200 dark:border-secondary-700 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-500 to-primary-600 p-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                <h3 className="font-semibold">Install App</h3>
              </div>
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            <p className="text-sm text-secondary-600 dark:text-secondary-300 mb-4">
              Install Second Brain for quick access and offline support!
            </p>

            {/* Benefits */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-xs text-secondary-500 dark:text-secondary-400">
                <Smartphone className="w-4 h-4 text-primary-500" />
                <span>Works offline</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-secondary-500 dark:text-secondary-400">
                <Monitor className="w-4 h-4 text-primary-500" />
                <span>Quick access from home screen</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-secondary-500 dark:text-secondary-400">
                <Download className="w-4 h-4 text-primary-500" />
                <span>Faster loading times</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="flex-1"
              >
                Not now
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleInstall}
                leftIcon={<Download className="w-4 h-4" />}
                className="flex-1"
              >
                Install
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Mini install button for header/footer
export function InstallButton(): JSX.Element | null {
  const { canInstall, installApp, isPWAInstalled } = useOffline();

  if (!canInstall || isPWAInstalled) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={installApp}
      leftIcon={<Download className="w-4 h-4" />}
      className="text-primary-600 dark:text-primary-400"
    >
      Install
    </Button>
  );
}
