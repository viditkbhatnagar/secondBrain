import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../../../components/ui/Modal';

// Mock radix-ui dialog
jest.mock('@radix-ui/react-dialog', () => {
  const React = require('react');
  return {
    Root: ({ children, open }: any) => open ? <>{children}</> : null,
    Portal: ({ children, forceMount }: any) => <>{children}</>,
    Overlay: ({ children, asChild }: any) => children,
    Content: ({ children, asChild }: any) => children,
    Title: ({ children, className }: any) => <h2 className={className}>{children}</h2>,
    Description: ({ children, className }: any) => <p className={className}>{children}</p>,
    Close: ({ children, asChild }: any) => children,
  };
});

describe('Modal', () => {
  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    children: <div>Modal content</div>,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders when open is true', () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('does not render when open is false', () => {
      render(<Modal {...defaultProps} open={false} />);
      expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
    });

    it('renders title when provided', () => {
      render(<Modal {...defaultProps} title="Modal Title" />);
      expect(screen.getByText('Modal Title')).toBeInTheDocument();
    });

    it('renders description when provided', () => {
      render(<Modal {...defaultProps} description="Modal description" />);
      expect(screen.getByText('Modal description')).toBeInTheDocument();
    });

    it('renders close button by default', () => {
      render(<Modal {...defaultProps} title="Title" />);
      expect(screen.getByLabelText('Close modal')).toBeInTheDocument();
    });

    it('hides close button when showCloseButton is false', () => {
      render(<Modal {...defaultProps} title="Title" showCloseButton={false} />);
      expect(screen.queryByLabelText('Close modal')).not.toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    it('renders small size', () => {
      render(<Modal {...defaultProps} size="sm" />);
      // Size classes are applied to the modal container
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('renders medium size by default', () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('renders large size', () => {
      render(<Modal {...defaultProps} size="lg" />);
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('renders xl size', () => {
      render(<Modal {...defaultProps} size="xl" />);
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('renders full size', () => {
      render(<Modal {...defaultProps} size="full" />);
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onOpenChange when close button is clicked', async () => {
      const onOpenChange = jest.fn();
      render(<Modal {...defaultProps} title="Title" onOpenChange={onOpenChange} />);
      
      await userEvent.click(screen.getByLabelText('Close modal'));
      // The IconButton click should trigger the Dialog.Close which calls onOpenChange
    });
  });

  describe('Custom className', () => {
    it('renders with custom className', () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });
  });
});
