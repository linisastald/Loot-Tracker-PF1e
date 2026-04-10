import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

// Mock api utility
vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/calendar/current-date') {
        return Promise.resolve({
          data: { year: 4722, month: 1, day: 15 },
        });
      }
      if (url === '/calendar/notes') {
        return Promise.resolve({ data: {} });
      }
      if (url === '/settings/region') {
        return Promise.resolve({ data: { value: 'Varisia' } });
      }
      if (url.startsWith('/weather/range')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn().mockResolvedValue({
      data: { year: 4722, month: 1, day: 16 },
    }),
  },
}));

import GolarionCalendar from '../GolarionCalendar';

const renderCalendar = () => {
  return render(
    <BrowserRouter>
      <GolarionCalendar />
    </BrowserRouter>
  );
};

describe('GolarionCalendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the calendar with Golarion day-of-week headers', async () => {
    renderCalendar();

    await waitFor(() => {
      expect(screen.getByText('Moonday')).toBeInTheDocument();
      expect(screen.getByText('Toilday')).toBeInTheDocument();
      expect(screen.getByText('Wealday')).toBeInTheDocument();
      expect(screen.getByText('Oathday')).toBeInTheDocument();
      expect(screen.getByText('Fireday')).toBeInTheDocument();
      expect(screen.getByText('Starday')).toBeInTheDocument();
      expect(screen.getByText('Sunday')).toBeInTheDocument();
    });
  });

  it('renders the month name and year in the header', async () => {
    renderCalendar();

    await waitFor(() => {
      expect(screen.getByText(/Abadius/)).toBeInTheDocument();
      expect(screen.getByText(/4722/)).toBeInTheDocument();
    });
  });

  it('renders Prev and Next month navigation buttons', async () => {
    renderCalendar();

    expect(screen.getByRole('button', { name: /Prev/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next$/i })).toBeInTheDocument();
  });

  it('renders Next Day and Go to Today buttons', async () => {
    renderCalendar();

    expect(screen.getByRole('button', { name: /Next Day/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go to Today/i })).toBeInTheDocument();
  });

  it('renders Set Current Day button', async () => {
    renderCalendar();

    expect(screen.getByRole('button', { name: /Set Current Day/i })).toBeInTheDocument();
  });

  it('renders the Add Days input and button', async () => {
    renderCalendar();

    expect(screen.getByLabelText(/Days/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Days/i })).toBeInTheDocument();
  });

  it('navigates to the next month when Next is clicked', async () => {
    renderCalendar();

    await waitFor(() => {
      expect(screen.getByText(/Abadius/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Next$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Calistril/)).toBeInTheDocument();
    });
  });

  it('navigates to the previous month when Prev is clicked', async () => {
    renderCalendar();

    await waitFor(() => {
      expect(screen.getByText(/Abadius/)).toBeInTheDocument();
    });

    // Go forward then back
    fireEvent.click(screen.getByRole('button', { name: /Next$/i }));
    await waitFor(() => {
      expect(screen.getByText(/Calistril/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Prev/i }));
    await waitFor(() => {
      const elements = screen.getAllByText(/Abadius/);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it('renders the selected date details panel after API loads', async () => {
    renderCalendar();

    await waitFor(() => {
      // The selected date panel should show with the current date info
      expect(screen.getByText(/Calendar Information/i)).toBeInTheDocument();
    });
  });

  it('renders save note button in the date details panel', async () => {
    renderCalendar();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Note/i })).toBeInTheDocument();
    });
  });
});
