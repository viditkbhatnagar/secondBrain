import React, { useState } from 'react';
import {
  HardDrive,
  Trash2,
  RefreshCw,
  Download,
  Wifi,
  WifiOff,
  Smartphone,
  Check
} from 'lucide-react';
import { useOffline } from '../../contexts/OfflineContext';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { useToast } from '../ui/Toast';

export function PWASettings(): JSX.Element {
  const {
    isOnline,
    isPWAInstalled,
    canInstall,
    installApp,
    cacheSize,
    clearCache,
    refreshCacheSize
  } = useOffline();
  const toast = useToast();
  const [isClearing, setIsClearing] = useState(false);

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      const success = await clearCache();
      if (success) {
        toast.success('Cache cleared successfully');
        await refreshCacheSize();
      } else {
        toast.error('Failed to clear cache');
      }
    } catch (error) {
      toast.error('Error clearing cache');
    } finally {
      setIsClearing(false);
    }
  };

  const handleInstall = async () => {
    const success = await installApp();
    if (success) {
      toast.success('App installed successfully!');
    }
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">
          App Settings
        </h3>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
          <div className="flex items-center gap-3">
            {isOnline ? (
              <Wifi className="w-5 h-5 text-success-500" />
            ) : (
              <WifiOff className="w-5 h-5 text-warning-500" />
            )}
            <div>
              <p className="text-sm font-medium text-secondary-900 dark:text-white">
                Connection Status
              </p>
              <p className="text-xs text-secondary-500">
                {isOnline ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-success-500' : 'bg-warning-500'}`} />
        </div>

        {/* Install Status */}
        <div className="flex items-center justify-between p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
          <div className="flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-primary-500" />
            <div>
              <p className="text-sm font-medium text-secondary-900 dark:text-white">
                App Installation
              </p>
              <p className="text-xs text-secondary-500">
                {isPWAInstalled ? 'Installed' : canInstall ? 'Available' : 'Not available'}
              </p>
            </div>
          </div>
          {isPWAInstalled ? (
            <Check className="w-5 h-5 text-success-500" />
          ) : canInstall ? (
            <Button size="sm" variant="primary" onClick={handleInstall}>
              <Download className="w-4 h-4 mr-1" />
              Install
            </Button>
          ) : null}
        </div>

        {/* Cache Size */}
        <div className="flex items-center justify-between p-3 bg-secondary-50 dark:bg-secondary-800 rounded-lg">
          <div className="flex items-center gap-3">
            <HardDrive className="w-5 h-5 text-secondary-500" />
            <div>
              <p className="text-sm font-medium text-secondary-900 dark:text-white">
                Cached Data
              </p>
              <p className="text-xs text-secondary-500">
                {formatSize(cacheSize)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={refreshCacheSize}
              aria-label="Refresh cache size"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={handleClearCache}
              isLoading={isClearing}
              disabled={cacheSize === 0}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
