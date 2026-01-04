import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useApiError } from '../../hooks/useApiError';
import { ToastProvider } from '../../components/ui/Toast';

// Mock radix-ui toast
jest.mock('@radix-ui/react-toast', () => ({
  Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Root: ({ children }: any) => <div>{children}</div>,
  Title: ({ children }: any) => <div>{children}</div>,
  Description: ({ children }: any) => <div>{children}</div>,
  Close: ({ children }: any) => <button>{children}</button>,
  Viewport: ({ children }: any) => <div>{children}</div>,
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    li: ({ children, ...props }: any) => <li {...props}>{children}</li>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

describe('useApiError Hook', () => {
  describe('getErrorMessage', () => {
    it('returns default message for null/undefined error', () => {
      const { result } = renderHook(() => useApiError(), { wrapper });
      
      expect(result.current.getErrorMessage(null)).toBe('An unknown error occurred');
      expect(result.current.getErrorMessage(undefined)).toBe('An unknown error occurred');
    });

    it('returns server message when available', () => {
      const { result } = renderHook(() => useApiError(), { wrapper });
      
      const error = {
        response: {
          status: 400,
          data: {
            error: {
              message: 'Custom server error message'
            }
          }
        }
      };
      
      expect(result.current.getErrorMessage(error)).toBe('Custom server error message');
    });

    it('returns data.message when error.message not available', () => {
      const { result } = renderHook(() => useApiError(), { wrapper });
      
      const error = {
        response: {
          status: 400,
          data: {
            message: 'Data level message'
          }
        }
      };
      
      expect(result.current.getErrorMessage(error)).toBe('Data level message');
    });

    describe('Status Code Messages', () => {
      const statusTests = [
        { status: 400, expected: 'Invalid request. Please check your input.' },
        { status: 401, expected: 'Authentication required. Please log in.' },
        { status: 403, expected: "You don't have permission to perform this action." },
        { status: 404, expected: 'The requested resource was not found.' },
        { status: 413, expected: 'File is too large. Maximum size is 100MB.' },
        { status: 415, expected: 'Unsupported file type.' },
        { status: 429, expected: 'Too many requests. Please wait a moment and try again.' },
        { status: 500, expected: 'Server error. Please try again later.' },
        { status: 502, expected: 'Service temporarily unavailable. Please try again.' },
        { status: 503, expected: 'Service is currently unavailable. Please try again later.' },
      ];

      statusTests.forEach(({ status, expected }) => {
        it(`returns correct message for status ${status}`, () => {
          const { result } = renderHook(() => useApiError(), { wrapper });
          
          const error = {
            response: {
              status,
              data: {}
            }
          };
          
          expect(result.current.getErrorMessage(error)).toBe(expected);
        });
      });

      it('returns default message for unknown status', () => {
        const { result } = renderHook(() => useApiError(), { wrapper });
        
        const error = {
          response: {
            status: 418, // I'm a teapot
            data: {}
          }
        };
        
        expect(result.current.getErrorMessage(error)).toBe('An unexpected error occurred. Please try again.');
      });
    });

    describe('Network Errors', () => {
      it('handles NETWORK_ERROR code', () => {
        const { result } = renderHook(() => useApiError(), { wrapper });
        
        const error = {
          code: 'NETWORK_ERROR'
        };
        
        expect(result.current.getErrorMessage(error)).toBe('Network error. Please check your internet connection.');
      });

      it('handles ERR_NETWORK code', () => {
        const { result } = renderHook(() => useApiError(), { wrapper });
        
        const error = {
          code: 'ERR_NETWORK'
        };
        
        expect(result.current.getErrorMessage(error)).toBe('Network error. Please check your internet connection.');
      });

      it('handles ECONNABORTED code', () => {
        const { result } = renderHook(() => useApiError(), { wrapper });
        
        const error = {
          code: 'ECONNABORTED'
        };
        
        expect(result.current.getErrorMessage(error)).toBe('Request timed out. Please try again.');
      });
    });

    describe('Standard Error Objects', () => {
      it('handles Error instance with message', () => {
        const { result } = renderHook(() => useApiError(), { wrapper });
        
        const error = new Error('Standard error message');
        
        expect(result.current.getErrorMessage(error)).toBe('Standard error message');
      });

      it('handles Error instance without message', () => {
        const { result } = renderHook(() => useApiError(), { wrapper });
        
        const error = new Error();
        
        expect(result.current.getErrorMessage(error)).toBe('An unexpected error occurred');
      });
    });

    describe('String Errors', () => {
      it('returns string error directly', () => {
        const { result } = renderHook(() => useApiError(), { wrapper });
        
        expect(result.current.getErrorMessage('String error')).toBe('String error');
      });
    });
  });

  describe('handleError', () => {
    it('logs error to console', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const { result } = renderHook(() => useApiError(), { wrapper });
      
      const error = new Error('Test error');
      
      act(() => {
        result.current.handleError(error);
      });
      
      expect(consoleSpy).toHaveBeenCalledWith('API Error:', error);
      consoleSpy.mockRestore();
    });

    it('handles error without crashing', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const { result } = renderHook(() => useApiError(), { wrapper });
      
      expect(() => {
        act(() => {
          result.current.handleError(new Error('Regular error'));
        });
      }).not.toThrow();
      
      consoleSpy.mockRestore();
    });

    it('handles rate limit errors (429)', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const { result } = renderHook(() => useApiError(), { wrapper });
      
      const error = {
        response: {
          status: 429,
          data: {}
        }
      };
      
      expect(() => {
        act(() => {
          result.current.handleError(error);
        });
      }).not.toThrow();
      
      consoleSpy.mockRestore();
    });

    it('handles service unavailable (503)', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const { result } = renderHook(() => useApiError(), { wrapper });
      
      const error = {
        response: {
          status: 503,
          data: {}
        }
      };
      
      expect(() => {
        act(() => {
          result.current.handleError(error);
        });
      }).not.toThrow();
      
      consoleSpy.mockRestore();
    });
  });
});

describe('useApiError Integration', () => {
  it('returns both handleError and getErrorMessage functions', () => {
    const { result } = renderHook(() => useApiError(), { wrapper });
    
    expect(typeof result.current.handleError).toBe('function');
    expect(typeof result.current.getErrorMessage).toBe('function');
  });

  it('handleError uses getErrorMessage internally', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const { result } = renderHook(() => useApiError(), { wrapper });
    
    const error = {
      response: {
        status: 404,
        data: {}
      }
    };
    
    // Both should work with the same error
    const message = result.current.getErrorMessage(error);
    expect(message).toBe('The requested resource was not found.');
    
    act(() => {
      result.current.handleError(error);
    });
    
    consoleSpy.mockRestore();
  });
});
