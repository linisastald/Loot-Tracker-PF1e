import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import ErrorBoundary from '../ErrorBoundary';

const Bomb: React.FC = () => {
  throw new Error('boom');
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught render errors; keep test output clean
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><div>fine</div></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });

  it('shows the fallback when a child throws', () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
  });

  it('after the retry limit the offered action really reloads the page', () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { ...original, reload } });

    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Try Again/ }));
    }
    // no dead "Reloading..." button: Try Again is gone and the page can be reloaded
    expect(screen.queryByRole('button', { name: /Try Again|Reloading/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Reload the page/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reload Page/ }));
    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: original });
  });

  it('one crashed route does not blank the next page when each route has its own keyed boundary', () => {
    const Good: React.FC = () => <div>good page</div>;
    render(
      <MemoryRouter initialEntries={['/bad']}>
        <Link to="/good">go good</Link>
        <Routes>
          <Route path="/bad" element={<ErrorBoundary key="/bad"><Bomb /></ErrorBoundary>} />
          <Route path="/good" element={<ErrorBoundary key="/good"><Good /></ErrorBoundary>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('go good'));
    expect(screen.getByText('good page')).toBeInTheDocument();
  });
});
