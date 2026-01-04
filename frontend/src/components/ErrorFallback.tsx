import React, { ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from './ui';

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo?: ErrorInfo | null;
  onReset?: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, errorInfo, onReset }) => {
  const isDev = process.env.NODE_ENV === 'development';

  const handleGoHome = () => {
    window.location.href = '/';
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleReportIssue = () => {
    const subject = encodeURIComponent(`Bug Report: ${error?.message || 'Unknown Error'}`);
    const body = encodeURIComponent(`
Error: ${error?.message || 'Unknown'}
Stack: ${error?.stack || 'Not available'}
Component Stack: ${errorInfo?.componentStack || 'Not available'}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}
Time: ${new Date().toISOString()}
    `);
    window.open(`mailto:support@example.com?subject=${subject}&body=${body}`);
  };

  return (
    <div className="min-h-screen bg-surface dark:bg-secondary-900 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="bg-white dark:bg-secondary-800 rounded-2xl shadow-xl p-8 text-center">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100 mb-2">
            Oops! Something went wrong
          </h1>

          {/* Message */}
          <p className="text-secondary-600 dark:text-secondary-400 mb-6">
            We encountered an unexpected error. Don't worry, your data is safe.
            Try refreshing the page or going back to the home page.
          </p>

          {/* Error details (dev only) */}
          {isDev && error && (
            <div className="mb-6 text-left">
              <details className="bg-secondary-100 dark:bg-secondary-900 rounded-lg p-4">
                <summary className="cursor-pointer text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                  Error Details (Development Only)
                </summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400">Error:</span>
                    <pre className="text-xs text-secondary-600 dark:text-secondary-400 overflow-auto mt-1 p-2 bg-secondary-200 dark:bg-secondary-800 rounded">
                      {error.message}
                    </pre>
                  </div>
                  {error.stack && (
                    <div>
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">Stack:</span>
                      <pre className="text-xs text-secondary-600 dark:text-secondary-400 overflow-auto mt-1 p-2 bg-secondary-200 dark:bg-secondary-800 rounded max-h-32">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                  {errorInfo?.componentStack && (
                    <div>
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">Component Stack:</span>
                      <pre className="text-xs text-secondary-600 dark:text-secondary-400 overflow-auto mt-1 p-2 bg-secondary-200 dark:bg-secondary-800 rounded max-h-32">
                        {errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {onReset && (
              <Button onClick={onReset} variant="primary">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            )}
            <Button onClick={handleReload} variant="secondary">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Page
            </Button>
            <Button onClick={handleGoHome} variant="ghost">
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>

          {/* Report link */}
          <button
            onClick={handleReportIssue}
            className="mt-6 inline-flex items-center gap-1 text-sm text-secondary-500 dark:text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <Bug className="w-4 h-4" />
            Report this issue
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorFallback;
