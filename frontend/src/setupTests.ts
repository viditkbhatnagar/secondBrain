import '@testing-library/jest-dom';
import 'whatwg-fetch';
import { server } from './__tests__/mocks/server';

// Mock framer-motion to prevent animation issues in tests
jest.mock('framer-motion', () => {
  const React = require('react');
  return {
    motion: {
      div: React.forwardRef(({ children, ...props }: any, ref: any) => 
        React.createElement('div', { ...props, ref }, children)),
      button: React.forwardRef(({ children, whileHover, whileTap, transition, ...props }: any, ref: any) => 
        React.createElement('button', { ...props, ref }, children)),
      li: React.forwardRef(({ children, ...props }: any, ref: any) => 
        React.createElement('li', { ...props, ref }, children)),
      article: React.forwardRef(({ children, ...props }: any, ref: any) => 
        React.createElement('article', { ...props, ref }, children)),
      section: React.forwardRef(({ children, ...props }: any, ref: any) => 
        React.createElement('section', { ...props, ref }, children)),
      p: React.forwardRef(({ children, ...props }: any, ref: any) => 
        React.createElement('p', { ...props, ref }, children)),
      span: React.forwardRef(({ children, ...props }: any, ref: any) => 
        React.createElement('span', { ...props, ref }, children)),
    },
    AnimatePresence: ({ children }: any) => children,
    useAnimation: () => ({ start: jest.fn(), stop: jest.fn() }),
    useMotionValue: (initial: any) => ({ get: () => initial, set: jest.fn() }),
    useTransform: (value: any, input: any, output: any) => ({ get: () => output[0] }),
  };
});

// Establish API mocking before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));

// Reset any request handlers that we may add during the tests
afterEach(() => server.resetHandlers());

// Clean up after the tests are finished
afterAll(() => server.close());

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// Mock scrollTo
window.scrollTo = jest.fn();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Suppress specific console errors during tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render is no longer supported') ||
       args[0].includes('Warning: An update to') ||
       args[0].includes('act(...)') ||
       args[0].includes('Warning: React does not recognize the') ||
       args[0].includes('Warning: Unknown event handler property'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
