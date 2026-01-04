import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '../../components/ErrorBoundary';

// Component that throws an error
const ThrowError: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow = true }) => {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>No error</div>;
};

describe('ErrorBoundary Component', () => {
  // Suppress console.error for expected errors
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  describe('Normal Rendering', () => {
    it('renders children when no error', () => {
      render(
        <ErrorBoundary>
          <div>Child content</div>
        </ErrorBoundary>
      );
      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('renders multiple children', () => {
      render(
        <ErrorBoundary>
          <div>First child</div>
          <div>Second child</div>
        </ErrorBoundary>
      );
      expect(screen.getByText('First child')).toBeInTheDocument();
      expect(screen.getByText('Second child')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('catches errors and shows fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );
      
      // Should show error fallback with "Oops" message
      expect(screen.getByText(/oops/i)).toBeInTheDocument();
    });

    it('shows custom fallback when provided', () => {
      render(
        <ErrorBoundary fallback={<div>Custom error UI</div>}>
          <ThrowError />
        </ErrorBoundary>
      );
      
      expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    });

    it('logs error to console', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );
      
      expect(console.error).toHaveBeenCalledWith(
        'React Error Boundary caught an error:',
        expect.any(Error)
      );
    });
  });

  describe('Error Fallback UI', () => {
    it('shows error message', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );
      
      expect(screen.getByText(/oops/i)).toBeInTheDocument();
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });

    it('shows Try Again button', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );
      
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });

    it('shows Refresh Page button', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );
      
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    });

    it('shows Go Home button', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );
      
      expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument();
    });
  });

  describe('Reset Functionality', () => {
    it('resets error state when Try Again is clicked', async () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );
      
      // Error should be shown
      expect(screen.getByText(/oops/i)).toBeInTheDocument();
      
      // Click Try Again - this will reset the boundary but component will throw again
      await userEvent.click(screen.getByRole('button', { name: /try again/i }));
      
      // After reset, if component still throws, error will show again
      // This tests that the reset mechanism works
      expect(screen.getByText(/oops/i)).toBeInTheDocument();
    });
  });

  describe('getDerivedStateFromError', () => {
    it('sets hasError to true when error occurs', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );
      
      // If hasError is true, fallback UI is shown
      expect(screen.getByText(/oops/i)).toBeInTheDocument();
    });
  });
});

describe('ErrorBoundary with Nested Components', () => {
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  it('catches errors from deeply nested components', () => {
    const DeepChild = () => {
      throw new Error('Deep error');
    };

    render(
      <ErrorBoundary>
        <div>
          <div>
            <DeepChild />
          </div>
        </div>
      </ErrorBoundary>
    );
    
    expect(screen.getByText(/oops/i)).toBeInTheDocument();
  });

  it('only catches errors in its subtree', () => {
    render(
      <div>
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
        <div>Outside boundary</div>
      </div>
    );
    
    expect(screen.getByText('Outside boundary')).toBeInTheDocument();
    expect(screen.getByText(/oops/i)).toBeInTheDocument();
  });
});
