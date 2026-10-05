import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import ProtectedRoute from '../ProtectedRoute';

const renderAt = (isAuthenticated: boolean) =>
  render(
    <MemoryRouter initialEntries={['/secret']}>
      <Routes>
        <Route path="/login" element={<div>login page</div>} />
        <Route
          path="/secret"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated}>
              <div>secret page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe('ProtectedRoute', () => {
  it('renders the children for an authenticated user', () => {
    renderAt(true);
    expect(screen.getByText('secret page')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    renderAt(false);
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
  });

  it('ignores a user cached in localStorage (the server-confirmed flag decides)', () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'DM' }));
    renderAt(false);
    expect(screen.getByText('login page')).toBeInTheDocument();
    localStorage.clear();
  });
});
