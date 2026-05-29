import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
      await screen.findByText(/characters who have rsvp'd/i)
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

  it('renders Assign and History tabs', () => {
    renderComponent();
    expect(screen.getByRole('tab', { name: /assign/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument();
  });

  it('fetches task history when the History tab is opened', async () => {
    renderComponent();

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/sessions/task-history');
    });
  });

  it('shows an empty-state message when there is no history', async () => {
    renderComponent();

    fireEvent.click(screen.getByRole('tab', { name: /history/i }));

    expect(
      await screen.findByText(/no task assignments have been saved yet/i)
    ).toBeInTheDocument();
  });

  it('renders saved history records returned from the API', async () => {
    // First call: active-characters; pre-populate call; then history fetch.
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/sessions/task-history') {
        return Promise.resolve({
          data: {
            data: [
              {
                id: 1,
                session_id: 5,
                session_title: 'Session 12',
                assignments: { pre: {}, during: {}, post: {} },
                character_count: 4,
                late_count: 1,
                created_by_name: 'testdm',
                created_at: '2026-05-01T18:00:00Z',
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderComponent();
    fireEvent.click(screen.getByRole('tab', { name: /history/i }));

    expect(await screen.findByText('Session 12')).toBeInTheDocument();
  });

  it('saves the assignment to history when tasks are assigned', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{ id: 1, name: 'Fighter Bob', player_name: 'Bob' }],
    });
    renderComponent();

    // Select the character, then assign.
    fireEvent.click(await screen.findByText('Fighter Bob'));
    fireEvent.click(
      screen.getByRole('button', { name: /assign tasks and send to discord/i })
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/sessions/task-history',
        expect.objectContaining({
          assignments: expect.any(Object),
          character_count: 1,
        })
      );
    });
  });
});
