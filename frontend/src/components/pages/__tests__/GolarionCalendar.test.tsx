import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

// Mock api utility (default implementations are installed in beforeEach so a
// test that overrides one cannot leak into the next)
vi.mock('../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Per-campaign settings (region, weather_forecast_days) come from the
// campaign context as strings (multi-campaign Phase 4c)
const refreshMock = vi.fn().mockResolvedValue(undefined);
let campaignSettingsValue: Record<string, unknown>;
let mockIsDM = false;

vi.mock('../../../contexts/CampaignContext', () => ({
  useIsDM: () => mockIsDM,
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

const installDefaultApiMocks = () => {
  (api.get as any).mockReset().mockImplementation((url: string) => {
    if (url === '/calendar/current-date') {
      return Promise.resolve({ data: { year: 4722, month: 1, day: 15 } });
    }
    if (url === '/calendar/notes') {
      return Promise.resolve({ data: [] });
    }
    if (url.startsWith('/weather/range')) {
      return Promise.resolve({ data: [] });
    }
    return Promise.resolve({ data: {} });
  });
  (api.post as any).mockReset().mockResolvedValue({ data: { year: 4722, month: 1, day: 16 } });
  (api.put as any).mockReset().mockResolvedValue({ data: { success: true } });
  (api.delete as any).mockReset().mockResolvedValue({ data: { success: true } });
};

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
    installDefaultApiMocks();
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

  it('renders Set Current Day button for a DM only', async () => {
    mockIsDM = true;
    renderCalendar();
    expect(screen.getByRole('button', { name: /Set Current Day/i })).toBeInTheDocument();
    mockIsDM = false;
  });

  it('hides Set Current Day from players', async () => {
    mockIsDM = false;
    renderCalendar();
    expect(screen.queryByRole('button', { name: /Set Current Day/i })).not.toBeInTheDocument();
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
    afterEach(() => {
      mockIsDM = false;
    });

    const weatherCallCount = () =>
      (api.get as any).mock.calls.filter((call: unknown[]) =>
        String(call[0]).startsWith('/weather/range')
      ).length;

    it('refetches weather for the month after confirming Set Current Day', async () => {
      mockIsDM = true;
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
      mockIsDM = false;
    });

    it('hides forecast controls from players', async () => {
      // Not a DM in this campaign
      renderCalendar();

      await waitFor(() => {
        expect(screen.getByText(/Calendar Information/i)).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /Regenerate Forecast/i })).not.toBeInTheDocument();
    });

    it('shows forecast controls to a DM', async () => {
      mockIsDM = true;

      renderCalendar();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Regenerate Forecast/i })).toBeInTheDocument();
      });
      expect(screen.getByLabelText(/Days ahead/i)).toBeInTheDocument();
    });

    it('prefills the forecast length from campaignSettings.weather_forecast_days', async () => {
      mockIsDM = true;
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
      mockIsDM = true;

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
      mockIsDM = true;
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

  describe('calendar mutations', () => {
    const NOTE = {
      id: 1,
      startDate: { year: 4722, month: 1, day: 15 },
      endDate: { year: 4722, month: 1, day: 15 },
      note: 'Meet the mayor',
      dmOnly: false,
      createdBy: 1,
    };

    const HOLIDAY = {
      id: 3, name: 'Crystalhue', month: 12, day: 21,
      category: 'Religious', deity: 'Shelyn', region: null,
      description: 'Winter solstice festival of art.', movableRule: null,
      isCustom: true, createdBy: 1,
    };

    const mockCalendarData = (overrides: { notes?: unknown[]; holidays?: unknown[]; weather?: unknown[] } = {}) => {
      (api.get as any).mockImplementation((url: string) => {
        if (url === '/calendar/current-date') {
          return Promise.resolve({ data: { year: 4722, month: 1, day: 15 } });
        }
        if (url === '/calendar/notes') return Promise.resolve({ data: overrides.notes ?? [] });
        if (url === '/calendar/holidays') return Promise.resolve({ data: overrides.holidays ?? [] });
        if (url.startsWith('/weather/range')) return Promise.resolve({ data: overrides.weather ?? [] });
        return Promise.resolve({ data: {} });
      });
    };

    afterEach(() => {
      mockIsDM = false;
    });

    it('Next Day posts to /calendar/next-day and moves to the returned date', async () => {
      renderCalendar();
      await screen.findByText(/Calendar Information/i);

      fireEvent.click(screen.getByRole('button', { name: /Next Day/i }));

      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/calendar/next-day'));
      expect(await screen.findByText(/16 Abadius 4722/)).toBeInTheDocument();
    });

    it('shows an error when Next Day fails', async () => {
      (api.post as any).mockRejectedValueOnce(new Error('boom'));
      renderCalendar();
      await screen.findByText(/Calendar Information/i);

      fireEvent.click(screen.getByRole('button', { name: /Next Day/i }));

      expect(await screen.findByText('Failed to advance day. Please try again later.')).toBeInTheDocument();
    });

    it('Add Days posts the number of days to /calendar/advance and clears the field', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { year: 4722, month: 1, day: 20 } });
      renderCalendar();
      await screen.findByText(/Calendar Information/i);

      fireEvent.change(screen.getByLabelText(/^Days$/i), { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: /Add Days/i }));

      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/calendar/advance', { days: 5 }));
      await waitFor(() => expect(screen.getByLabelText(/^Days$/i)).toHaveValue(null));
    });

    it('Add Days rejects a non-positive number without calling the API', async () => {
      renderCalendar();
      await screen.findByText(/Calendar Information/i);

      fireEvent.change(screen.getByLabelText(/^Days$/i), { target: { value: '0' } });
      fireEvent.click(screen.getByRole('button', { name: /Add Days/i }));

      expect(await screen.findByText('Please enter a valid number of days')).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('adds a note for the selected date with the entered span and flags', async () => {
      mockCalendarData();
      renderCalendar();
      await screen.findByRole('button', { name: /Add Note/i });

      fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Buy rope' } });
      fireEvent.change(screen.getByLabelText(/Spans \(days\)/i), { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: /Add Note/i }));

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith('/calendar/notes', {
          startDate: { year: 4722, month: 1, day: 15 },
          days: 3,
          note: 'Buy rope',
          dmOnly: false,
          asSeparateNotes: false,
        })
      );
    });

    it('does not submit an empty note', async () => {
      mockCalendarData();
      renderCalendar();
      await screen.findByRole('button', { name: /Add Note/i });

      fireEvent.click(screen.getByRole('button', { name: /Add Note/i }));

      expect(await screen.findByText('Note text is required.')).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });

    it('edits an existing note through PUT with the new text', async () => {
      mockCalendarData({ notes: [NOTE] });
      renderCalendar();

      fireEvent.click((await screen.findAllByLabelText('edit note'))[0]);
      const field = await screen.findByLabelText('Note');
      expect(field).toHaveValue('Meet the mayor');
      fireEvent.change(field, { target: { value: 'Meet the sheriff' } });
      fireEvent.click(screen.getByRole('button', { name: /Update Note/i }));

      await waitFor(() =>
        expect(api.put).toHaveBeenCalledWith('/calendar/notes/1', {
          note: 'Meet the sheriff',
          days: 1,
          dmOnly: false,
        })
      );
    });

    it('deletes a note', async () => {
      mockCalendarData({ notes: [NOTE] });
      renderCalendar();

      fireEvent.click((await screen.findAllByLabelText('delete note'))[0]);

      await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/calendar/notes/1'));
    });

    it('shows an error when deleting a note fails', async () => {
      mockCalendarData({ notes: [NOTE] });
      (api.delete as any).mockRejectedValueOnce(new Error('nope'));
      renderCalendar();

      fireEvent.click((await screen.findAllByLabelText('delete note'))[0]);

      expect(await screen.findByText('Failed to delete note. Please try again later.')).toBeInTheDocument();
    });

    it('a DM can regenerate the forecast', async () => {
      mockIsDM = true;
      renderCalendar();

      fireEvent.click(await screen.findByRole('button', { name: /Regenerate Forecast/i }));

      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/weather/regenerate-forecast'));
      expect(await screen.findByText(/Forecast regenerated/i)).toBeInTheDocument();
    });

    it('a DM can set the weather for the selected day', async () => {
      mockIsDM = true;
      renderCalendar();
      await screen.findByText(/Calendar Information/i);

      fireEvent.click(await screen.findByRole('button', { name: /^Edit$/ }));
      fireEvent.change(await screen.findByLabelText(/Low/), { target: { value: '40' } });
      fireEvent.change(screen.getByLabelText(/High/), { target: { value: '55' } });
      fireEvent.click(screen.getByRole('button', { name: /Save Weather/i }));

      await waitFor(() =>
        expect(api.put).toHaveBeenCalledWith(
          '/weather/set',
          expect.objectContaining({ year: 4722, month: 1, day: 15, region: 'Varisia', tempLow: 40, tempHigh: 55 })
        )
      );
    });

    it('a DM can add a holiday', async () => {
      mockIsDM = true;
      mockCalendarData({ holidays: [HOLIDAY] });
      renderCalendar();

      fireEvent.click(await screen.findByRole('tab', { name: 'Holidays' }));
      fireEvent.click(await screen.findByRole('button', { name: /Add Holiday/i }));
      fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Harvest Feast' } });
      const buttons = screen.getAllByRole('button', { name: /Add Holiday/i });
      fireEvent.click(buttons[buttons.length - 1]);

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          '/calendar/holidays',
          expect.objectContaining({ name: 'Harvest Feast', month: null, day: null })
        )
      );
    });

    it('a DM can add the first holiday of a campaign that has none', async () => {
      mockIsDM = true;
      mockCalendarData({ holidays: [] });
      renderCalendar();

      fireEvent.click(await screen.findByRole('tab', { name: 'Holidays' }));
      expect(await screen.findByText(/No holidays defined/i)).toBeInTheDocument();
      fireEvent.click(await screen.findByRole('button', { name: /Add Holiday/i }));
      fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'First Feast' } });
      const buttons = screen.getAllByRole('button', { name: /Add Holiday/i });
      fireEvent.click(buttons[buttons.length - 1]);

      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          '/calendar/holidays',
          expect.objectContaining({ name: 'First Feast' })
        )
      );
    });

    it('players do not get an Add Holiday button when there are no holidays', async () => {
      mockIsDM = false;
      mockCalendarData({ holidays: [] });
      renderCalendar();

      fireEvent.click(await screen.findByRole('tab', { name: 'Holidays' }));
      expect(await screen.findByText(/No holidays defined/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add Holiday/i })).not.toBeInTheDocument();
    });

    it('official holidays are read-only: no edit or delete controls, even for a DM', async () => {
      mockIsDM = true;
      mockCalendarData({ holidays: [{ ...HOLIDAY, id: 4, name: 'Swallowtail Festival', isCustom: false }] });
      renderCalendar();

      fireEvent.click(await screen.findByRole('tab', { name: 'Holidays' }));
      expect(await screen.findByText(/Swallowtail Festival/)).toBeInTheDocument();
      expect(screen.queryByLabelText('edit holiday')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('delete holiday')).not.toBeInTheDocument();
    });

    it('shows the server message when deleting a holiday is refused', async () => {
      mockIsDM = true;
      mockCalendarData({ holidays: [HOLIDAY] });
      (api.delete as any).mockRejectedValueOnce({ response: { data: { message: 'Official holidays cannot be changed' } } });
      renderCalendar();

      fireEvent.click(await screen.findByRole('tab', { name: 'Holidays' }));
      fireEvent.click(await screen.findByLabelText('delete holiday'));

      expect(await screen.findByText('Official holidays cannot be changed')).toBeInTheDocument();
    });

    it('a DM can delete a custom holiday', async () => {
      mockIsDM = true;
      mockCalendarData({ holidays: [HOLIDAY] });
      renderCalendar();

      fireEvent.click(await screen.findByRole('tab', { name: 'Holidays' }));
      fireEvent.click(await screen.findByLabelText('delete holiday'));

      await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/calendar/holidays/3'));
    });
  });
});
