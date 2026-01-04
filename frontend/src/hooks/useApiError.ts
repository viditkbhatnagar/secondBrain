import { useCallback } from 'react';
import { useToast } from '../components/ui';

interface ApiError {
  response?: {
    status?: number;
    data?: {
      error?: {
        code?: string;
        message?: string;
      };
      message?: string;
    };
  };
  code?: string;
  message?: string;
}

interface UseApiErrorReturn {
  handleError: (error: ApiError | Error | unknown) => void;
  getErrorMessage: (error: ApiError | Error | unknown) => string;
}

export function useApiError(): UseApiErrorReturn {
  const toast = useToast();

  const getErrorMessage = useCallback((error: ApiError | Error | unknown): string => {
    if (!error) return 'An unknown error occurred';

    // Handle axios-style errors
    if (typeof error === 'object' && error !== null && 'response' in error) {
      const apiError = error as ApiError;
      const status = apiError.response?.status;
      const serverMessage = apiError.response?.data?.error?.message || apiError.response?.data?.message;

      // Use server message if available
      if (serverMessage) return serverMessage;

      // Fallback to status-based messages
      switch (status) {
        case 400:
          return 'Invalid request. Please check your input.';
        case 401:
          return 'Authentication required. Please log in.';
        case 403:
          return 'You don\'t have permission to perform this action.';
        case 404:
          return 'The requested resource was not found.';
        case 413:
          return 'File is too large. Maximum size is 100MB.';
        case 415:
          return 'Unsupported file type.';
        case 429:
          return 'Too many requests. Please wait a moment and try again.';
        case 500:
          return 'Server error. Please try again later.';
        case 502:
          return 'Service temporarily unavailable. Please try again.';
        case 503:
          return 'Service is currently unavailable. Please try again later.';
        default:
          return 'An unexpected error occurred. Please try again.';
      }
    }

    // Handle network errors
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const apiError = error as ApiError;
      if (apiError.code === 'NETWORK_ERROR' || apiError.code === 'ERR_NETWORK') {
        return 'Network error. Please check your internet connection.';
      }
      if (apiError.code === 'ECONNABORTED') {
        return 'Request timed out. Please try again.';
      }
    }

    // Handle standard Error objects
    if (error instanceof Error) {
      return error.message || 'An unexpected error occurred';
    }

    // Handle string errors
    if (typeof error === 'string') {
      return error;
    }

    return 'An unexpected error occurred';
  }, []);

  const handleError = useCallback((error: ApiError | Error | unknown): void => {
    const message = getErrorMessage(error);
    
    // Determine toast type based on error
    let isWarning = false;
    
    if (typeof error === 'object' && error !== null && 'response' in error) {
      const apiError = error as ApiError;
      const status = apiError.response?.status;
      
      // Use warning for rate limits and temporary issues
      if (status === 429 || status === 503) {
        isWarning = true;
      }
    }

    if (isWarning) {
      toast.warning(message);
    } else {
      toast.error(message);
    }

    // Log error for debugging
    console.error('API Error:', error);
  }, [getErrorMessage, toast]);

  return { handleError, getErrorMessage };
}

export default useApiError;
