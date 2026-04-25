import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the api utility (4 levels up from ItemManagement/__tests__/)
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the timezone hook so it does not perform any side-effect API calls
vi.mock('../../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({
    timezone: 'America/New_York',
    loading: false,
    error: null,
  }),
}));

// Mock timezone utility — keep formatting deterministic by using a marker
// string. Use a real vi.fn so we can assert on its invocation.
const formatInCampaignTimezoneMock = vi.fn(
  (date: string | Date | null | undefined) =>
    date == null ? '' : `formatted:${date}`,
);

vi.mock('../../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: (
    date: string | Date | null | undefined,
    timezone: string,
    formatPattern?: string,
  ) => formatInCampaignTimezoneMock(date, timezone, formatPattern),
  fetchCampaignTimezone: vi.fn().mockResolvedValue('America/New_York'),
  clearTimezoneCache: vi.fn(),
}));

import api from '../../../../utils/api';
import SearchHistoryManagement from '../SearchHistoryManagement';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FROZEN_NOW = new Date('2026-04-24T15:00:00Z');
const TODAY_ISO_DATE = '2026-04-24';

const mockItemSearches = [
  {
    id: 1,
    search_datetime: '2026-04-24T10:00:00Z',
    item_name: 'Cloak of Resistance +1',
    item_type: 'wondrous',
    city_name: 'Magnimar',
    city_size: 'Large City',
    item_value: 1000,
    roll_result: 75,
    availability_threshold: 80,
    found: true,
    character_name: 'Valeros',
    notes: 'Searched at the Black Bottle',
  },
  {
    id: 2,
    search_datetime: '2026-04-24T11:30:00Z',
    item_name: 'Wand of Fireball',
    item_type: null,
    city_name: 'Sandpoint',
    city_size: 'Small Town',
    item_value: 11250,
    roll_result: 22,
    availability_threshold: 5,
    found: false,
    character_name: 'Ezren',
    notes: null,
  },
];

const mockSpellcastingServices = [
  {
    id: 100,
    request_datetime: '2026-04-24T13:00:00Z',
    spell_name: 'Restoration',
    spell_level: 4,
    caster_level: 7,
    city_name: 'Magnimar',
    city_size: 'Large City',
    city_max_spell_level: 6,
    cost: 280,
    character_name: 'Kyra',
    notes: 'After the boss fight',
  },
];

// Default mock for api.get based on URL
const setupDefaultGetMock = (
  itemSearches: any[] = mockItemSearches,
  spellcasting: any[] = mockSpellcastingServices,
  itemEnvelope: 'data' | 'raw' = 'data',
  spellEnvelope: 'data' | 'raw' = 'data',
) => {
  (api.get as any).mockImplementation((url: string) => {
    if (url === '/item-search') {
      return Promise.resolve(
        itemEnvelope === 'data' ? { data: itemSearches } : itemSearches,
      );
    }
    if (url === '/spellcasting') {
      return Promise.resolve(
        spellEnvelope === 'data' ? { data: spellcasting } : spellcasting,
      );
    }
    return Promise.resolve({ data: [] });
  });
};

// Helper to grab the date input
const getDateInput = (): HTMLInputElement => {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find(l => /filter by date/i.test(l.textContent || ''));
  if (!label) throw new Error('Could not find "Filter by Date" label');
  const inputId = label.getAttribute('for');
  if (!inputId) throw new Error('Label has no for attribute');
  const input = document.getElementById(inputId) as HTMLInputElement;
  if (!input) throw new Error(`Could not find input with id ${inputId}`);
  return input;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Stub Date so the component computes today's ISO date deterministically
// without using vi.useFakeTimers (which would also stall React/Promise micro
// scheduling and break waitFor).
const RealDate = Date;

const installFrozenDate = () => {
  class FrozenDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(FROZEN_NOW.getTime());
      } else {
        // @ts-expect-error pass through args
        super(...args);
      }
    }
    static now() {
      return FROZEN_NOW.getTime();
    }
  }
  // @ts-expect-error patch global Date
  globalThis.Date = FrozenDate;
};

const restoreRealDate = () => {
  globalThis.Date = RealDate;
};

describe('SearchHistoryManagement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // The mock fn defined above also gets reset by resetAllMocks; restore its
    // implementation so the format helper produces a deterministic value.
    formatInCampaignTimezoneMock.mockImplementation(
      (date: string | Date | null | undefined) =>
        date == null ? '' : `formatted:${date}`,
    );
    installFrozenDate();
    setupDefaultGetMock();
  });

  afterEach(() => {
    restoreRealDate();
  });

  // -------------------------------------------------------------------------
  // 1. Default mount fetches both endpoints with today's date
  // -------------------------------------------------------------------------
  describe('Initial load', () => {
    it('fetches /item-search and /spellcasting on mount with today as the default date', async () => {
      render(<SearchHistoryManagement />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/item-search', {
          params: { date: TODAY_ISO_DATE },
        });
        expect(api.get).toHaveBeenCalledWith('/spellcasting', {
          params: { date: TODAY_ISO_DATE },
        });
      });

      // Each endpoint called exactly once
      const itemCalls = (api.get as any).mock.calls.filter(
        (c: any[]) => c[0] === '/item-search',
      );
      const spellCalls = (api.get as any).mock.calls.filter(
        (c: any[]) => c[0] === '/spellcasting',
      );
      expect(itemCalls).toHaveLength(1);
      expect(spellCalls).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Item searches table contents
  // -------------------------------------------------------------------------
  describe('Item searches table', () => {
    it('renders a row per item search with all expected columns', async () => {
      render(<SearchHistoryManagement />);

      await waitFor(() => {
        expect(
          screen.getByText('Cloak of Resistance +1'),
        ).toBeInTheDocument();
      });

      // First row data
      expect(screen.getByText('Cloak of Resistance +1')).toBeInTheDocument();
      expect(screen.getByText('wondrous')).toBeInTheDocument();
      // Magnimar appears in both item-search and spellcasting tables
      expect(screen.getAllByText('Magnimar').length).toBeGreaterThanOrEqual(1);
      // Large City appears in both tables as well
      expect(screen.getAllByText('Large City').length).toBeGreaterThanOrEqual(
        1,
      );
      expect(screen.getByText('1000 gp')).toBeInTheDocument();
      expect(screen.getByText('75')).toBeInTheDocument();
      expect(screen.getByText('80')).toBeInTheDocument();
      expect(screen.getByText('YES')).toBeInTheDocument();
      expect(screen.getByText('Valeros')).toBeInTheDocument();
      expect(
        screen.getByText('Searched at the Black Bottle'),
      ).toBeInTheDocument();

      // Second row
      expect(screen.getByText('Wand of Fireball')).toBeInTheDocument();
      expect(screen.getByText('Sandpoint')).toBeInTheDocument();
      expect(screen.getByText('Small Town')).toBeInTheDocument();
      expect(screen.getByText('11250 gp')).toBeInTheDocument();
      expect(screen.getByText('22')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('NO')).toBeInTheDocument();
      expect(screen.getByText('Ezren')).toBeInTheDocument();

      // Time column: formatted via the mocked timezone helper
      expect(
        screen.getByText('formatted:2026-04-24T10:00:00Z'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('formatted:2026-04-24T11:30:00Z'),
      ).toBeInTheDocument();
    });

    it('shows table headers for the item searches table', async () => {
      render(<SearchHistoryManagement />);

      await waitFor(() => {
        expect(screen.getByText('Cloak of Resistance +1')).toBeInTheDocument();
      });

      // Each of these headers should appear at least once
      expect(screen.getAllByText('Time').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Item')).toBeInTheDocument();
      expect(screen.getByText('Item Value')).toBeInTheDocument();
      expect(screen.getByText('Roll')).toBeInTheDocument();
      expect(screen.getByText('Threshold')).toBeInTheDocument();
      expect(screen.getByText('Found')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Spellcasting services table contents
  // -------------------------------------------------------------------------
  describe('Spellcasting services table', () => {
    it('renders a row per spellcasting service with all expected columns', async () => {
      render(<SearchHistoryManagement />);

      await waitFor(() => {
        expect(screen.getByText('Restoration')).toBeInTheDocument();
      });

      expect(screen.getByText('Restoration')).toBeInTheDocument();
      // spell_level=4
      expect(screen.getByText('4')).toBeInTheDocument();
      // caster_level=7
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.getByText('280 gp')).toBeInTheDocument();
      expect(screen.getByText('Kyra')).toBeInTheDocument();
      expect(screen.getByText('After the boss fight')).toBeInTheDocument();
      // city_max_spell_level rendered as "Max: 6th"
      expect(screen.getByText(/max:\s*6th/i)).toBeInTheDocument();

      // Time column for spellcasting
      expect(
        screen.getByText('formatted:2026-04-24T13:00:00Z'),
      ).toBeInTheDocument();
    });

    it('shows the spellcasting service section heading', async () => {
      render(<SearchHistoryManagement />);

      await waitFor(() => {
        expect(
          screen.getByText('Spellcasting Service Requests'),
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Date filter
  // -------------------------------------------------------------------------
  describe('Date filter', () => {
    it('refetches both endpoints with the new date when the date input changes', async () => {
      render(<SearchHistoryManagement />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/item-search', {
          params: { date: TODAY_ISO_DATE },
        });
      });

      // Change the date filter to a different value
      const newDate = '2026-03-15';
      const dateInput = getDateInput();
      fireEvent.change(dateInput, { target: { value: newDate } });

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/item-search', {
          params: { date: newDate },
        });
        expect(api.get).toHaveBeenCalledWith('/spellcasting', {
          params: { date: newDate },
        });
      });

      // Should have been called twice for each endpoint now
      const itemCalls = (api.get as any).mock.calls.filter(
        (c: any[]) => c[0] === '/item-search',
      );
      const spellCalls = (api.get as any).mock.calls.filter(
        (c: any[]) => c[0] === '/spellcasting',
      );
      expect(itemCalls).toHaveLength(2);
      expect(spellCalls).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Empty results
  // -------------------------------------------------------------------------
  describe('Empty results', () => {
    it('shows both "no item searches" and "no spellcasting services" alerts when both endpoints return empty arrays', async () => {
      setupDefaultGetMock([], []);

      render(<SearchHistoryManagement />);

      await waitFor(() => {
        expect(
          screen.getByText(`No item searches found for ${TODAY_ISO_DATE}`),
        ).toBeInTheDocument();
        expect(
          screen.getByText(
            `No spellcasting services found for ${TODAY_ISO_DATE}`,
          ),
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 6. Found vs not-found row coloring
  // -------------------------------------------------------------------------
  describe('Row coloring', () => {
    it('applies success styling to rows where found=true and error styling when found=false', async () => {
      render(<SearchHistoryManagement />);

      await waitFor(() => {
        expect(screen.getByText('Cloak of Resistance +1')).toBeInTheDocument();
      });

      // The component sets the row backgroundColor sx prop to either
      // 'success.light' or 'error.light'. MUI's emotion runtime resolves these
      // to theme color values; in jsdom the resolved styles are present on
      // the DOM node. We verify by looking at the YES/NO Typography children
      // which use color: success.dark / error.dark and have theme-styled
      // colors, and additionally check that the parent row's background is
      // distinct between the two rows.
      const yesCell = screen.getByText('YES');
      const noCell = screen.getByText('NO');

      const foundRow = yesCell.closest('tr') as HTMLElement;
      const notFoundRow = noCell.closest('tr') as HTMLElement;
      expect(foundRow).not.toBeNull();
      expect(notFoundRow).not.toBeNull();

      const foundBg = window.getComputedStyle(foundRow).backgroundColor;
      const notFoundBg = window.getComputedStyle(notFoundRow).backgroundColor;

      // The two rows should have *different* backgrounds (success vs error)
      // — even when both are empty strings in jsdom this assertion would
      // fail, so fall back to verifying the YES/NO Typography color classes
      // actually differ between the two cells.
      const yesColor = window.getComputedStyle(yesCell).color;
      const noColor = window.getComputedStyle(noCell).color;

      // At least one of the indicators must differ between found / not-found
      const rowBackgroundsDiffer = foundBg !== notFoundBg;
      const textColorsDiffer = yesColor !== noColor;
      expect(rowBackgroundsDiffer || textColorsDiffer).toBe(true);

      // Sanity: the YES/NO labels live in the right rows
      expect(within(foundRow).getByText('YES')).toBeInTheDocument();
      expect(within(notFoundRow).getByText('NO')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 7. Loading state
  // -------------------------------------------------------------------------
  describe('Loading state', () => {
    it('shows a CircularProgress spinner until both fetches resolve', async () => {
      // Hold both endpoints unresolved
      let resolveItems!: (v: any) => void;
      let resolveSpells!: (v: any) => void;
      const itemPromise = new Promise(res => {
        resolveItems = res;
      });
      const spellPromise = new Promise(res => {
        resolveSpells = res;
      });
      (api.get as any).mockImplementation((url: string) => {
        if (url === '/item-search') return itemPromise;
        if (url === '/spellcasting') return spellPromise;
        return Promise.resolve({ data: [] });
      });

      render(<SearchHistoryManagement />);

      // Initially, spinner is visible
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      // Tables / empty alerts not yet rendered
      expect(
        screen.queryByText(/no item searches found/i),
      ).not.toBeInTheDocument();

      // Resolve both fetches
      resolveItems({ data: [] });
      resolveSpells({ data: [] });

      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
      // Now empty-state alerts should render
      expect(
        screen.getByText(`No item searches found for ${TODAY_ISO_DATE}`),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 8. Regression: non-array response should NOT crash
  // -------------------------------------------------------------------------
  describe('Regression: non-array API response', () => {
    it('does not crash and renders the empty state when /item-search returns a non-array body', async () => {
      // Item searches returns { data: { unexpected: 'object' } } (NOT an array)
      // Spellcasting still returns a normal empty list so we can render the
      // empty alerts.
      (api.get as any).mockImplementation((url: string) => {
        if (url === '/item-search') {
          return Promise.resolve({ data: { unexpected: 'object' } });
        }
        if (url === '/spellcasting') {
          return Promise.resolve({ data: [] });
        }
        return Promise.resolve({ data: [] });
      });

      render(<SearchHistoryManagement />);

      // Component should fall through to the empty-state alert rather than
      // throwing because itemSearches.map(...) was invoked on a non-array.
      await waitFor(() => {
        expect(
          screen.getByText(`No item searches found for ${TODAY_ISO_DATE}`),
        ).toBeInTheDocument();
      });

      // No crash banner / error alert
      expect(
        screen.queryByText('Error fetching search history'),
      ).not.toBeInTheDocument();
    });

    it('does not crash when /spellcasting returns a non-array body', async () => {
      (api.get as any).mockImplementation((url: string) => {
        if (url === '/item-search') {
          return Promise.resolve({ data: [] });
        }
        if (url === '/spellcasting') {
          return Promise.resolve({ data: { unexpected: 'thing' } });
        }
        return Promise.resolve({ data: [] });
      });

      render(<SearchHistoryManagement />);

      await waitFor(() => {
        expect(
          screen.getByText(
            `No spellcasting services found for ${TODAY_ISO_DATE}`,
          ),
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 9. Error state
  // -------------------------------------------------------------------------
  describe('Error state', () => {
    it('shows the error alert when an API call rejects', async () => {
      (api.get as any).mockImplementation((url: string) => {
        if (url === '/item-search') return Promise.reject(new Error('boom'));
        if (url === '/spellcasting') return Promise.resolve({ data: [] });
        return Promise.resolve({ data: [] });
      });

      // Suppress the component's console.error so the test output stays clean
      const errorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      render(<SearchHistoryManagement />);

      await waitFor(() => {
        expect(
          screen.getByText('Error fetching search history'),
        ).toBeInTheDocument();
      });

      errorSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // 10. Timezone formatting
  // -------------------------------------------------------------------------
  describe('Timezone formatting', () => {
    it('invokes the timezone formatter with the campaign timezone for each datetime', async () => {
      render(<SearchHistoryManagement />);

      await waitFor(() => {
        expect(screen.getByText('Cloak of Resistance +1')).toBeInTheDocument();
        expect(screen.getByText('Restoration')).toBeInTheDocument();
      });

      // The formatter should have been invoked once per row (2 item searches
      // + 1 spellcasting service = 3 datetimes minimum).
      expect(
        formatInCampaignTimezoneMock.mock.calls.length,
      ).toBeGreaterThanOrEqual(3);

      // Verify it received the expected datetimes paired with the mocked
      // 'America/New_York' timezone and the 'PPp z' format pattern.
      const callArgs = formatInCampaignTimezoneMock.mock.calls;
      const datetimesPassed = callArgs.map(c => c[0]);

      expect(datetimesPassed).toContain('2026-04-24T10:00:00Z');
      expect(datetimesPassed).toContain('2026-04-24T11:30:00Z');
      expect(datetimesPassed).toContain('2026-04-24T13:00:00Z');

      // Each call uses the campaign timezone + 'PPp z' format
      for (const [, tz, fmt] of callArgs) {
        expect(tz).toBe('America/New_York');
        expect(fmt).toBe('PPp z');
      }
    });
  });
});
