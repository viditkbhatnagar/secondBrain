import React from 'react';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardContent, CardFooter } from '../../../components/ui/Card';

describe('Card', () => {
  it('renders children correctly', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies variant styles', () => {
    const { rerender } = render(<Card variant="elevated" data-testid="card">Elevated</Card>);
    expect(screen.getByTestId('card')).toHaveClass('bg-white');

    rerender(<Card variant="outlined" data-testid="card">Outlined</Card>);
    expect(screen.getByTestId('card')).toHaveClass('border-2');

    rerender(<Card variant="filled" data-testid="card">Filled</Card>);
    expect(screen.getByTestId('card')).toHaveClass('bg-secondary-50');
  });

  it('applies padding styles', () => {
    const { rerender } = render(<Card padding="none" data-testid="card">None</Card>);
    expect(screen.getByTestId('card')).toHaveClass('p-0');

    rerender(<Card padding="sm" data-testid="card">Small</Card>);
    expect(screen.getByTestId('card')).toHaveClass('p-3');

    rerender(<Card padding="md" data-testid="card">Medium</Card>);
    expect(screen.getByTestId('card')).toHaveClass('p-4');

    rerender(<Card padding="lg" data-testid="card">Large</Card>);
    expect(screen.getByTestId('card')).toHaveClass('p-6');
  });

  it('applies hoverable styles', () => {
    render(<Card hoverable data-testid="card">Hoverable</Card>);
    expect(screen.getByTestId('card')).toBeInTheDocument();
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Card ref={ref}>Card</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('applies custom className', () => {
    render(<Card className="custom-class" data-testid="card">Custom</Card>);
    expect(screen.getByTestId('card')).toHaveClass('custom-class');
  });

  it('passes through additional props', () => {
    render(<Card data-testid="test-card">Card</Card>);
    expect(screen.getByTestId('test-card')).toBeInTheDocument();
  });
});

describe('CardHeader', () => {
  it('renders children', () => {
    render(<CardHeader>Header Content</CardHeader>);
    expect(screen.getByText('Header Content')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<CardHeader title="Card Title" />);
    expect(screen.getByText('Card Title')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<CardHeader title="Title" subtitle="Subtitle text" />);
    expect(screen.getByText('Subtitle text')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<CardHeader className="custom-header" data-testid="header">Header</CardHeader>);
    expect(screen.getByTestId('header')).toHaveClass('custom-header');
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<CardHeader ref={ref}>Header</CardHeader>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('CardTitle', () => {
  it('renders title via CardHeader', () => {
    render(<CardHeader title="Card Title" />);
    expect(screen.getByText('Card Title')).toBeInTheDocument();
  });

  it('renders as h3 element via CardHeader', () => {
    render(<CardHeader title="Title" />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Title');
  });

  it('applies text styles via CardHeader', () => {
    render(<CardHeader title="Styled Title" />);
    expect(screen.getByText('Styled Title')).toHaveClass('text-lg', 'font-semibold');
  });
});

describe('CardContent', () => {
  it('renders children', () => {
    render(<CardContent>Content here</CardContent>);
    expect(screen.getByText('Content here')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<CardContent className="custom-content">Content</CardContent>);
    expect(screen.getByText('Content')).toHaveClass('custom-content');
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<CardContent ref={ref}>Content</CardContent>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('CardFooter', () => {
  it('renders children', () => {
    render(<CardFooter>Footer content</CardFooter>);
    expect(screen.getByText('Footer content')).toBeInTheDocument();
  });

  it('applies border styles', () => {
    render(<CardFooter>Footer</CardFooter>);
    expect(screen.getByText('Footer')).toHaveClass('border-t');
  });

  it('applies custom className', () => {
    render(<CardFooter className="custom-footer">Footer</CardFooter>);
    expect(screen.getByText('Footer')).toHaveClass('custom-footer');
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<CardFooter ref={ref}>Footer</CardFooter>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('Card Composition', () => {
  it('renders complete card with all parts', () => {
    render(
      <Card>
        <CardHeader title="Complete Card" />
        <CardContent>
          <p>Main content goes here</p>
        </CardContent>
        <CardFooter>
          <button>Cancel</button>
          <button>Save</button>
        </CardFooter>
      </Card>
    );

    expect(screen.getByText('Complete Card')).toBeInTheDocument();
    expect(screen.getByText('Main content goes here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
