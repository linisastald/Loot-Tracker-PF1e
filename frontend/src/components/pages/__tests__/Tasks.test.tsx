import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

import Tasks from '../Tasks';
import api from '../../../utils/api';

const renderComponent = () =>
  render(
    <BrowserRouter>
      <Tasks />
    </BrowserRouter>
  );

describe('Tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the character selection instructions', async () => {
    renderComponent();
    expect(
      await screen.findByText(/select which characters will be present/i)
    ).toBeInTheDocument();
  });

  it('renders the assign tasks button', () => {
    renderComponent();
    expect(
      screen.getByRole('button', { name: /assign tasks and send to discord/i })
    ).toBeInTheDocument();
  });

  it('renders the ready to assign section', () => {
    renderComponent();
    expect(screen.getByText(/ready to assign tasks/i)).toBeInTheDocument();
  });

  it('shows character count as 0 selected initially', () => {
    renderComponent();
    expect(screen.getByText(/0 selected, 0 arriving late/i)).toBeInTheDocument();
  });

  it('fetches active characters on mount', () => {
    renderComponent();
    expect(api.get).toHaveBeenCalledWith('/user/active-characters');
  });

  it('renders character names when returned from API', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: [
        { id: 1, name: 'Fighter Bob', player_name: 'Bob' },
        { id: 2, name: 'Wizard Alice', player_name: 'Alice' },
      ],
    });
    renderComponent();
    expect(await screen.findByText('Fighter Bob')).toBeInTheDocument();
    expect(screen.getByText('Wizard Alice')).toBeInTheDocument();
  });

  it('displays task description text', () => {
    renderComponent();
    expect(
      screen.getByText(/tasks will be randomly assigned to selected characters/i)
    ).toBeInTheDocument();
  });
});
