/**
 * Simple working test to ensure test infrastructure works
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

// Simple component for testing
const SimpleComponent = ({ message = 'Hello World' }) => {
  return <div data-testid="simple-component">{message}</div>;
};

describe('Simple Component Tests', () => {
  it('should render hello world message', () => {
    render(<SimpleComponent />);
    expect(screen.getByTestId('simple-component')).toHaveTextContent('Hello World');
  });

  it('should render custom message', () => {
    render(<SimpleComponent message="Test Message" />);
    expect(screen.getByTestId('simple-component')).toHaveTextContent('Test Message');
  });

  it('should be in the document', () => {
    render(<SimpleComponent />);
    expect(screen.getByTestId('simple-component')).toBeInTheDocument();
  });
});