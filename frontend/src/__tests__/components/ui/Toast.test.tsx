import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '../../../components/ui/Toast';

// Mock radix-ui toast
jest.mock('@radix-ui/react-toast', () => ({
  Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Root: ({ children, ...props }: any) => <div role="alert" {...props}>{children}</div>,
  Title: ({ children, className }: any) => <div className={className}>{children}</div>,
  Description: ({ children, className }: any) => <div className={className}>{children}</div>,
  Close: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
  Viewport: ({ children }: any) => <div>{children}</div>,
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    li: ({ children, className, ...props }: any) => <li className={className} {...props}>{children}</li>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Test component that uses the toast hook
const TestComponent: React.FC<{ 
  toastType?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  description?: string;
}> = ({ 
  toastType = 'success', 
  title = 'Test Title',
  description
}) => {
  const toast = useToast();

  const handleClick = () => {
    toast[toastType](title, description);
  };

  return <button onClick={handleClick}>Show Toast</button>;
};

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<ToastProvider>{ui}</ToastProvider>);
};

describe('ToastProvider', () => {
  it('renders children', () => {
    renderWithProvider(<div>Child content</div>);
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('provides toast context to children', () => {
    renderWithProvider(<TestComponent />);
    expect(screen.getByRole('button', { name: 'Show Toast' })).toBeInTheDocument();
  });
});

describe('useToast Hook', () => {
  it('throws error when used outside provider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useToast must be used within a ToastProvider');
    
    consoleError.mockRestore();
  });

  describe('Toast Types', () => {
    it('shows success toast', async () => {
      renderWithProvider(<TestComponent toastType="success" title="Success!" />);
      
      await userEvent.click(screen.getByRole('button'));
      expect(screen.getByText('Success!')).toBeInTheDocument();
    });

    it('shows error toast', async () => {
      renderWithProvider(<TestComponent toastType="error" title="Error occurred" />);
      
      await userEvent.click(screen.getByRole('button'));
      expect(screen.getByText('Error occurred')).toBeInTheDocument();
    });

    it('shows warning toast', async () => {
      renderWithProvider(<TestComponent toastType="warning" title="Warning!" />);
      
      await userEvent.click(screen.getByRole('button'));
      expect(screen.getByText('Warning!')).toBeInTheDocument();
    });

    it('shows info toast', async () => {
      renderWithProvider(<TestComponent toastType="info" title="Info message" />);
      
      await userEvent.click(screen.getByRole('button'));
      expect(screen.getByText('Info message')).toBeInTheDocument();
    });
  });

  describe('Toast with description', () => {
    it('shows toast with description', async () => {
      renderWithProvider(
        <TestComponent 
          toastType="success" 
          title="Success" 
          description="Operation completed successfully" 
        />
      );
      
      await userEvent.click(screen.getByRole('button'));
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Operation completed successfully')).toBeInTheDocument();
    });
  });

  describe('Multiple Toasts', () => {
    it('can show multiple toasts', async () => {
      renderWithProvider(<TestComponent title="Toast" />);
      
      const button = screen.getByRole('button');
      await userEvent.click(button);
      await userEvent.click(button);
      await userEvent.click(button);
      
      const toasts = screen.getAllByText('Toast');
      expect(toasts.length).toBe(3);
    });
  });
});

describe('Toast Context Functions', () => {
  const TestAllFunctions: React.FC = () => {
    const toast = useToast();

    return (
      <div>
        <button onClick={() => toast.success('Success')}>Success</button>
        <button onClick={() => toast.error('Error')}>Error</button>
        <button onClick={() => toast.warning('Warning')}>Warning</button>
        <button onClick={() => toast.info('Info')}>Info</button>
        <button onClick={() => toast.addToast({ type: 'success', title: 'Custom' })}>Custom</button>
      </div>
    );
  };

  it('provides all toast functions', async () => {
    renderWithProvider(<TestAllFunctions />);
    
    await userEvent.click(screen.getByRole('button', { name: 'Success' }));
    // Use getAllByText since there's both a button and toast with "Success"
    const successElements = screen.getAllByText('Success');
    expect(successElements.length).toBeGreaterThanOrEqual(2);
  });

  it('addToast works with custom toast object', async () => {
    renderWithProvider(<TestAllFunctions />);
    
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    // Use getAllByText since there's both a button and toast with "Custom"
    const customElements = screen.getAllByText('Custom');
    expect(customElements.length).toBeGreaterThanOrEqual(2);
  });
});
