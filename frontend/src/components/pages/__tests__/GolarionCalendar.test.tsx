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
        return Promise.resolve({ data: [] });
      }
      if (url.startsWith('/weather/range')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn().mockResolvedValue({
      data: { year: 4722, month: 1, day: 16 },
    }),
    put: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

// Per-campaign settings (region, weather_forecast_days) come from the
// campaign context as strings (multi-campaign Phase 4c)
const refreshMock = vi.fn().mockResolvedValue(undefined);
let campaignSettingsValue: Record<string, unknown>;

vi.mock('../../../contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaigns: [],
    currentCampaign: { id: 1, name: 'Test Campaign', slug: 'test' },
    campaignRole: 'DM',
    isSuperadmin: false,
    campaignSettings: campaignSettingsValue,
    loading: false,
    switchCampaign: vi.fn(),
    refresh: refreshMock,
  }),
}));

import api from '../../../utils/api';
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
    campaignSettingsValue = { region: 'Varisia', weather_forecast_days: '7' };
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

  it('renders the add-note button in the date details panel', async () => {
    renderCalendar();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Note/i })).toBeInTheDocument();
    });
  });

  describe('set current day', () => {
    const weatherCallCount = () =>
      (api.get as any).mock.calls.filter((call: unknown[]) =>
        String(call[0]).startsWith('/weather/range')
      ).length;

    it('refetches weather for the month after confirming Set Current Day', async () => {
      renderCalendar();

      // Initial load: current date selected + first weather fetch done
      await waitFor(() => {
        expect(screen.getByText(/Calendar Information/i)).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(weatherCallCount()).toBeGreaterThan(0);
      });
      const callsBefore = weatherCallCount();

      fireEvent.click(screen.getByRole('button', { name: /Set Current Day/i }));
      fireEvent.click(await screen.findByRole('button', { name: /Confirm/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/calendar/set-current-date', {
          year: 4722,
          month: 1,
          day: 15,
        });
      });
      // The fix: weather is refetched so newly generated weather appears
      // without a page reload
      await waitFor(() => {
        expect(weatherCallCount()).toBeGreaterThan(callsBefore);
      });
    });
  });

  describe('notes', () => {
    it('renders existing notes (with range) in the All Notes agenda', async () => {
      (api.get as any).mockImplementation((url: string) => {
        if (url === '/calendar/current-date') {
          return Promise.resolve({ data: { year: 4722, month: 1, day: 15 } });
        }
        if (url === '/calendar/notes') {
          return Promise.resolve({ data: [
            {
              id: 1,
              startDate: { year: 4722, month: 1, day: 10 },
              endDate: { year: 4722, month: 1, day: 12 },
              note: 'Party traveled to Sandpoint',
              dmOnly: false,
              createdBy: 1,
            },
          ]});
        }
        if (url === '/settings/region') {
          return Promise.resolve({ data: { value: 'Varisia' } });
        }
        if (url.startsWith('/weather/range')) {
          return Promise.resolve({ data: [] });
        }
        return Promise.resolve({ data: {} });
      });

      renderCalendar();

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Notes' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('tab', { name: 'Notes' }));

      await waitFor(() => {
        expect(screen.getByText('All Notes')).toBeInTheDocument();
      });
      expect(screen.getAllByText('Party traveled to Sandpoint').length).toBeGreaterThan(0);
      // The multi-day note shows its date range (unique to the agenda chip)
      expect(screen.getByText(/10 Abadius 4722 .* 12 Abadius 4722/)).toBeInTheDocument();
    });
  });

  describe('holidays', () => {
    it('renders the holidays section, list entry, and category filter', async () => {
      (api.get as any).mockImplementation((url: string) => {
        if (url === '/calendar/current-date') {
          return Promise.resolve({ data: { year: 4722, month: 1, day: 15 } });
        }
        if (url === '/calendar/notes') {
          return Promise.resolve({ data: [] });
        }
        if (url === '/calendar/holidays') {
          return Promise.resolve({ data: [
            {
              id: 1, name: 'Crystalhue', month: 12, day: 21,
              category: 'Religious', deity: 'Shelyn', region: null,
              description: 'Winter solstice festival of art.', movableRule: 'Winter solstice',
              isCustom: false, createdBy: null,
            },
          ]});
        }
        if (url === '/settings/region') {
          return Promise.resolve({ data: { value: 'Varisia' } });
        }
        if (url.startsWith('/weather/range')) {
          return Promise.resolve({ data: [] });
        }
        return Promise.resolve({ data: {} });
      });

      renderCalendar();

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: 'Holidays' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('tab', { name: 'Holidays' }));

      await waitFor(() => {
        expect(screen.getByText('Show on calendar:')).toBeInTheDocument();
      });
      expect(screen.getAllByText(/Crystalhue/).length).toBeGreaterThan(0);
      // The category appears as a filter chip and a list chip
      expect(screen.getAllByText('Religious').length).toBeGreaterThan(0);
    });
  });

  describe('DM weather controls', () => {
    afterEach(() => {
      localStorage.clear();
    });

    it('hides forecast controls from players', async () => {
      // No user in localStorage -> isDM() is false
      renderCalendar();

      await waitFor(() => {
        expect(screen.getByText(/Calendar Information/i)).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /Regenerate Forecast/i })).not.toBeInTheDocument();
    });

    it('shows forecast controls to a DM', async () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'dm', role: 'DM' }));

      renderCalendar();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Regenerate Forecast/i })).toBeInTheDocument();
      });
      expect(screen.getByLabelText(/Days ahead/i)).toBeInTheDocument();
    });

    it('prefills the forecast length from campaignSettings.weather_forecast_days', async () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'dm', role: 'DM' }));
      campaignSettingsValue = { region: 'Varisia', weather_forecast_days: '14' };

      renderCalendar();

      await waitFor(() => {
        expect(screen.getByLabelText(/Days ahead/i)).toHaveValue(14);
      });
      // The legacy settings GET is gone
      const calls = (api.get as any).mock.calls.map((c: unknown[]) => String(c[0]));
      expect(calls).not.toContain('/settings/weather-forecast-days');
      expect(calls).not.toContain('/settings/region');
    });

    it('saves the forecast length to the per-campaign settings endpoint and refreshes', async () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'dm', role: 'DM' }));

      renderCalendar();

      await waitFor(() => {
        expect(screen.getByLabelText(/Days ahead/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/Days ahead/i), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/campaigns/current/settings', {
          name: 'weather_forecast_days',
          value: '10',
        });
      });
      await waitFor(() => {
        expect(refreshMock).toHaveBeenCalled();
      });
      expect(await screen.findByText(/Forecast length set to 10 day\(s\)/i)).toBeInTheDocument();
    });

    it('surfaces the backend envelope message when the forecast save fails', async () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'dm', role: 'DM' }));
      (api.put as any).mockRejectedValueOnce({
        response: { status: 403, data: { success: false, message: 'DM role required' } },
      });

      renderCalendar();

      await waitFor(() => {
        expect(screen.getByLabelText(/Days ahead/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

      expect(await screen.findByText('DM role required')).toBeInTheDocument();
      expect(refreshMock).not.toHaveBeenCalled();
    });

    it('uses the campaign-settings region for weather fetches', async () => {
      campaignSettingsValue = { region: 'Cheliax', weather_forecast_days: '7' };

      renderCalendar();

      await waitFor(() => {
        const weatherCalls = (api.get as any).mock.calls
          .map((c: unknown[]) => String(c[0]))
          .filter((u: string) => u.startsWith('/weather/range'));
        expect(weatherCalls.length).toBeGreaterThan(0);
        expect(weatherCalls[weatherCalls.length - 1]).toMatch(/\/Cheliax$/);
      });
    });
  });
});
