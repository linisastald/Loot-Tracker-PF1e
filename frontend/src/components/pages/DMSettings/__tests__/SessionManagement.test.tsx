import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import { SnackbarProvider } from 'notistack';

// Provide a robust ResizeObserver shim. MUI's TextareaAutosize (used by
// multiline TextField in the Create + Cancel dialogs) instantiates one and
// calls .observe() at layout-effect time. The global setupTests stub doesn't
// always survive how MUI grabs the constructor, so re-declare it here.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;
(window as any).ResizeObserver = MockResizeObserver;

// ---------------------------------------------------------------------------
// Module mocks (must come before importing the SUT)
// ---------------------------------------------------------------------------

// Mock the api utility (4 levels up from DMSettings/__tests__/)
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

// Mock timezone utility - keep dates deterministic and rendered as a stable
// pass-through so tests can assert against raw ISO strings if needed.
vi.mock('../../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: (date: string) => `formatted:${date}`,
  fetchCampaignTimezone: vi.fn().mockResolvedValue('America/New_York'),
  clearTimezoneCache: vi.fn(),
}));

// MUI X date pickers are extremely difficult to interact with via fireEvent
// in jsdom (popper-positioning, transitions, native pointer events). Stub
// them out with a plain text input that emits a Date on change. This lets
// us verify that the component's payload uses ISO strings without trying
// to drive the real picker UI.
vi.mock('@mui/x-date-pickers/DateTimePicker', () => ({
  DateTimePicker: ({ label, value, onChange }: any) => (
    <input
      aria-label={label}
      data-testid={`dtp-${label}`}
      value={value ? new Date(value).toISOString() : ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v ? new Date(v) : null);
      }}
    />
  ),
}));

vi.mock('@mui/x-date-pickers/DatePicker', () => ({
  DatePicker: ({ label, value, onChange }: any) => (
    <input
      aria-label={label}
      data-testid={`dp-${label}`}
      value={value ? new Date(value).toISOString() : ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v ? new Date(v) : null);
      }}
    />
  ),
}));

vi.mock('@mui/x-date-pickers/AdapterDateFns', () => ({
  AdapterDateFns: vi.fn(),
}));

vi.mock('@mui/x-date-pickers/LocalizationProvider', () => ({
  LocalizationProvider: ({ children }: any) => <>{children}</>,
}));

import api from '../../../../utils/api';
import SessionManagement from '../SessionManagement';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Build ISO strings in the near future so the sessions are both
// "isUpcoming" AND fall inside the default date range filter
// (today .. today + 2 months) used by the component.
const futureISO = (offsetDays: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(20, 0, 0, 0);
  return d.toISOString();
};

const mockSessions = [
  {
    id: 1,
    title: 'Weekly Game Night',
    description: 'Standard session',
    start_time: futureISO(3),
    end_time: futureISO(3),
    status: 'scheduled',
    minimum_players: 3,
    confirmed_count: 1,
    declined_count: 0,
    maybe_count: 0,
    confirmed_names: 'Alice',
    maybe_names: null,
    declined_names: null,
  },
  {
    id: 2,
    title: 'Boss Fight Session',
    description: 'Big bad encounter',
    start_time: futureISO(7),
    end_time: futureISO(7),
    status: 'confirmed',
    minimum_players: 3,
    confirmed_count: 4,
    declined_count: 0,
    maybe_count: 1,
    confirmed_names: 'Alice, Bob, Carol, Dave',
    maybe_names: 'Eve',
    declined_names: null,
  },
  {
    id: 3,
    title: 'Cancelled Session',
    description: 'Was scrubbed',
    start_time: futureISO(10),
    end_time: futureISO(10),
    status: 'cancelled',
    minimum_players: 3,
    confirmed_count: 0,
    declined_count: 2,
    maybe_count: 0,
    confirmed_names: null,
    maybe_names: null,
    declined_names: 'Bob, Carol',
  },
  {
    id: 4,
    title: 'Min Players Met Session',
    description: 'Ready to confirm',
    start_time: futureISO(14),
    end_time: futureISO(14),
    status: 'scheduled',
    minimum_players: 3,
    confirmed_count: 3,
    declined_count: 0,
    maybe_count: 0,
    confirmed_names: 'Alice, Bob, Carol',
    maybe_names: null,
    declined_names: null,
  },
];

const mockAttendanceDetails = [
  {
    username: 'alice',
    character_name: 'Aragorn',
    response_type: 'yes',
    response_timestamp: '2026-04-20T15:00:00Z',
    notes: 'Looking forward to it',
  },
  {
    username: 'bob',
    character_name: null,
    response_type: 'maybe',
    response_timestamp: '2026-04-20T16:00:00Z',
    notes: null,
  },
];

const setupDefaultGetMock = (sessions: any[] = mockSessions) => {
  (api.get as any).mockImplementation((url: string) => {
    if (url === '/sessions/enhanced') return Promise.resolve({ data: sessions });
    if (url === '/sessions') return Promise.resolve({ data: sessions });
    if (/\/sessions\/\d+\/attendance\/detailed/.test(url)) {
      // attendance endpoint: component reads response.data.data
      return Promise.resolve({ data: { data: mockAttendanceDetails } });
    }
    return Promise.resolve({ data: [] });
  });
};

const renderSessionManagement = () => {
  return render(
    <BrowserRouter>
      <SnackbarProvider maxSnack={3}>
        <SessionManagement />
      </SnackbarProvider>
    </BrowserRouter>
  );
};

// Helper for inputs that are linked to a label via the label's "for" attr.
// We don't strictly need this for the date pickers (we use aria-label there),
// but it can help if we add label-based queries elsewhere.
const getInputByLabel = (labelPattern: RegExp): HTMLInputElement => {
  const labels = Array.from(document.querySelectorAll('label'));
  const label = labels.find(l => labelPattern.test(l.textContent || ''));
  if (!label) throw new Error(`Could not find label matching ${labelPattern}`);
  const inputId = label.getAttribute('for');
  if (!inputId) throw new Error(`Label has no 'for' attribute`);
  const input = document.getElementById(inputId) as HTMLInputElement;
  if (!input) throw new Error(`Could not find input with id '${inputId}'`);
  return input;
};

// Open the Create Session dialog (memoizes a couple repeated steps).
const openCreateSessionDialog = async () => {
  fireEvent.click(screen.getByRole('button', { name: /create session/i }));
  await waitFor(() => {
    expect(screen.getByText('Create New Session')).toBeInTheDocument();
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionManagement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupDefaultGetMock();
    localStorage.clear();
  });

  // -------------------------------------------------------------------------
  // 1. Mount + initial fetch
  // -------------------------------------------------------------------------
  describe('Initial load', () => {
    it('fetches sessions from /sessions/enhanced on mount', async () => {
      renderSessionManagement();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/sessions/enhanced');
      });

      // Should only call enhanced; the legacy fallback only fires on failure.
      const enhancedCalls = (api.get as any).mock.calls.filter(
        (c: any[]) => c[0] === '/sessions/enhanced'
      );
      expect(enhancedCalls.length).toBe(1);
    });

    it('renders all returned sessions as cards', async () => {
      renderSessionManagement();

      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      expect(screen.getByText('Boss Fight Session')).toBeInTheDocument();
      // Cancelled session is filtered out of the default view (filterStatus.cancelled = false)
      expect(screen.queryByText('Cancelled Session')).not.toBeInTheDocument();
      expect(screen.getByText('Min Players Met Session')).toBeInTheDocument();
    });

    it('falls back to /sessions when /sessions/enhanced fails', async () => {
      (api.get as any).mockImplementation((url: string) => {
        if (url === '/sessions/enhanced') return Promise.reject(new Error('boom'));
        if (url === '/sessions') return Promise.resolve({ data: mockSessions });
        return Promise.resolve({ data: [] });
      });

      renderSessionManagement();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/sessions');
      });

      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Filter by status (client-side; component does NOT refetch)
  // -------------------------------------------------------------------------
  describe('Status filters', () => {
    it('toggling Confirmed off hides confirmed sessions; toggling Cancelled on shows them', async () => {
      renderSessionManagement();

      await waitFor(() => {
        expect(screen.getByText('Boss Fight Session')).toBeInTheDocument();
      });

      // Open the filters panel
      fireEvent.click(screen.getByRole('button', { name: /filters/i }));

      // Confirmed checkbox is on by default; toggling it should hide the
      // 'Boss Fight Session' card.
      const confirmedCheckbox = screen.getByRole('checkbox', { name: /confirmed/i });
      fireEvent.click(confirmedCheckbox);

      await waitFor(() => {
        expect(screen.queryByText('Boss Fight Session')).not.toBeInTheDocument();
      });

      // Toggling Cancelled on (it's off by default) should reveal the cancelled card.
      const cancelledCheckbox = screen.getByRole('checkbox', { name: /cancelled/i });
      fireEvent.click(cancelledCheckbox);

      await waitFor(() => {
        expect(screen.getByText('Cancelled Session')).toBeInTheDocument();
      });

      // The component does NOT refetch on filter changes (filtering is client-side);
      // verify only the initial mount fetch is recorded.
      const enhancedCalls = (api.get as any).mock.calls.filter(
        (c: any[]) => c[0] === '/sessions/enhanced'
      );
      expect(enhancedCalls.length).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Filter by date range (client-side)
  // -------------------------------------------------------------------------
  describe('Date range filters', () => {
    it('narrowing the To date hides sessions outside the range', async () => {
      renderSessionManagement();

      await waitFor(() => {
        expect(screen.getByText('Min Players Met Session')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /filters/i }));

      // Set To Date to today (UTC) -> all future sessions should be hidden
      const todayStr = new Date().toISOString().slice(0, 10);
      const toInput = getInputByLabel(/^to date/i);
      fireEvent.change(toInput, { target: { value: todayStr } });

      await waitFor(() => {
        expect(screen.getByText(/no sessions match your filters/i)).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Reset filters
  // -------------------------------------------------------------------------
  describe('Reset filters', () => {
    it('Reset button restores default checkbox state', async () => {
      renderSessionManagement();

      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /filters/i }));

      // Toggle a couple filters off
      fireEvent.click(screen.getByRole('checkbox', { name: /confirmed/i }));
      fireEvent.click(screen.getByRole('checkbox', { name: /scheduled/i }));

      // Click Reset (the panel reset button is a Button labeled "Reset")
      fireEvent.click(screen.getByRole('button', { name: /^reset$/i }));

      await waitFor(() => {
        expect((screen.getByRole('checkbox', { name: /scheduled/i }) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByRole('checkbox', { name: /confirmed/i }) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByRole('checkbox', { name: /completed/i }) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByRole('checkbox', { name: /cancelled/i }) as HTMLInputElement).checked).toBe(false);
      });

      // Sessions should be back
      expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      expect(screen.getByText('Boss Fight Session')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Create Session
  // -------------------------------------------------------------------------
  describe('Create Session', () => {
    it('submits POST /sessions with the form payload, closes dialog, and refreshes list', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { id: 999 } });

      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      await openCreateSessionDialog();

      const dialog = screen.getByRole('dialog');
      const titleInput = within(dialog).getByLabelText(/session title/i);
      fireEvent.change(titleInput, { target: { value: 'New Test Session' } });

      // Set start/end on the stubbed pickers via aria-label
      const startInput = within(dialog).getByTestId('dtp-Start Time');
      const endInput = within(dialog).getByTestId('dtp-End Time');
      // End must be strictly greater than start to pass component validation.
      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() + 20);
      startDate.setUTCHours(20, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setUTCHours(23, 0, 0, 0);
      fireEvent.change(startInput, { target: { value: startDate.toISOString() } });
      fireEvent.change(endInput, { target: { value: endDate.toISOString() } });

      // Click the "Create Session" button inside the dialog
      const createBtn = within(dialog).getByRole('button', { name: /^create session$/i });
      fireEvent.click(createBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalled();
      });

      const [endpoint, payload] = (api.post as any).mock.calls[0];
      expect(endpoint).toBe('/sessions');
      expect(payload).toMatchObject({
        title: 'New Test Session',
        start_time: expect.any(String),
        end_time: expect.any(String),
        description: '',
        minimum_players: 3,
      });
      // Recurring fields must NOT be present for non-recurring create
      expect(payload).not.toHaveProperty('recurring_pattern');
      expect(payload).not.toHaveProperty('recurring_day_of_week');

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByText('Create New Session')).not.toBeInTheDocument();
      });

      // Sessions list refresh: enhanced should be called twice (mount + after create)
      await waitFor(() => {
        const enhancedCalls = (api.get as any).mock.calls.filter(
          (c: any[]) => c[0] === '/sessions/enhanced'
        );
        expect(enhancedCalls.length).toBe(2);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 6. Create Recurring Session
  // -------------------------------------------------------------------------
  describe('Create Recurring Session', () => {
    it('submits POST /sessions/recurring with recurring fields included', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { id: 1000 } });

      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      await openCreateSessionDialog();

      const dialog = screen.getByRole('dialog');
      const titleInput = within(dialog).getByLabelText(/session title/i);
      fireEvent.change(titleInput, { target: { value: 'Recurring Friday Game' } });

      const startInput = within(dialog).getByTestId('dtp-Start Time');
      const endInput = within(dialog).getByTestId('dtp-End Time');
      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() + 2);
      startDate.setUTCHours(20, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setUTCHours(23, 0, 0, 0);
      fireEvent.change(startInput, { target: { value: startDate.toISOString() } });
      fireEvent.change(endInput, { target: { value: endDate.toISOString() } });

      // Toggle "Make this a recurring session"
      const recurringCheckbox = within(dialog).getByRole('checkbox', {
        name: /make this a recurring session/i,
      });
      fireEvent.click(recurringCheckbox);

      // The Frequency Select default is "weekly" (already correct).
      // We set day-of-week to Friday (5) by interacting with the native <select>
      // exposed by MUI's mocked-out behaviors. MUI Select renders a hidden
      // input with the current value; we change it via the displayed combobox.
      // Easiest: open the dropdown by role.
      const dayOfWeekTrigger = within(dialog).getByRole('combobox', { name: /day of week/i });
      fireEvent.mouseDown(dayOfWeekTrigger);
      // The list of MenuItems renders in a portal; query globally via screen.
      const fridayItem = await screen.findByRole('option', { name: 'Friday' });
      fireEvent.click(fridayItem);

      // Set Number of Sessions to 8
      const sessionsCountInput = within(dialog).getByLabelText(/number of sessions/i);
      fireEvent.change(sessionsCountInput, { target: { value: '8' } });

      // Click the dynamic "Create N Recurring Sessions" button
      const createBtn = within(dialog).getByRole('button', {
        name: /create 8 recurring sessions/i,
      });
      fireEvent.click(createBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalled();
      });

      const [endpoint, payload] = (api.post as any).mock.calls[0];
      expect(endpoint).toBe('/sessions/recurring');
      expect(payload).toMatchObject({
        title: 'Recurring Friday Game',
        recurring_pattern: 'weekly',
        recurring_day_of_week: 5,
        recurring_interval: 1,
        recurring_end_count: 8,
      });
    });
  });

  // -------------------------------------------------------------------------
  // 6b. Start/end time auto-sync
  // -------------------------------------------------------------------------
  describe('End time auto-sync', () => {
    it('rolls the auto-synced end time to the next day for overnight sessions', async () => {
      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      await openCreateSessionDialog();
      const dialog = screen.getByRole('dialog');

      const startInput = within(dialog).getByTestId('dtp-Start Time') as HTMLInputElement;
      const endInput = within(dialog).getByTestId('dtp-End Time') as HTMLInputElement;

      // Choose a start whose clock time equals the current (auto-derived) end
      // time, on a future date. The sync copies the end's clock onto the new
      // start date, which would land exactly at the start — i.e. an overnight
      // session — and must roll to the NEXT day, not stay before/at the start.
      const initialEnd = new Date(endInput.value);
      const startDate = new Date(initialEnd);
      startDate.setDate(startDate.getDate() + 30);
      fireEvent.change(startInput, { target: { value: startDate.toISOString() } });

      const expectedEnd = new Date(startDate);
      expectedEnd.setDate(expectedEnd.getDate() + 1);

      await waitFor(() => {
        expect(new Date(endInput.value).getTime()).toBe(expectedEnd.getTime());
      });
      // Regression guard for the silent-failure bug: end must be after start
      expect(new Date(endInput.value).getTime()).toBeGreaterThan(startDate.getTime());
    });

    it('blocks creation and shows a visible error when end time is before start time', async () => {
      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      await openCreateSessionDialog();
      const dialog = screen.getByRole('dialog');

      const titleInput = within(dialog).getByLabelText(/session title/i);
      fireEvent.change(titleInput, { target: { value: 'Backwards Times' } });

      const startInput = within(dialog).getByTestId('dtp-Start Time');
      const endInput = within(dialog).getByTestId('dtp-End Time');
      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() + 20);
      startDate.setUTCHours(23, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setUTCHours(4, 0, 0, 0); // same day, 7h BEFORE start
      fireEvent.change(startInput, { target: { value: startDate.toISOString() } });
      fireEvent.change(endInput, { target: { value: endDate.toISOString() } });

      const createBtn = within(dialog).getByRole('button', { name: /^create session$/i });
      fireEvent.click(createBtn);

      // Visible feedback (snackbar and/or inline helper text) must appear...
      const errors = await screen.findAllByText(/end time must be after start time/i);
      expect(errors.length).toBeGreaterThan(0);
      // ...and no request may be sent
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 7. Required-field validation
  // -------------------------------------------------------------------------
  describe('Required-field validation on Create', () => {
    it('does not POST when title is empty', async () => {
      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      await openCreateSessionDialog();

      const dialog = screen.getByRole('dialog');
      // Title left empty. Click Create.
      const createBtn = within(dialog).getByRole('button', { name: /^create session$/i });
      fireEvent.click(createBtn);

      // Give the handler a tick to run
      await new Promise(r => setTimeout(r, 50));
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 8. Save Default Settings -> localStorage
  // -------------------------------------------------------------------------
  describe('Save Default Settings', () => {
    it('persists updated defaults to localStorage', async () => {
      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      // Open the Defaults dialog
      fireEvent.click(screen.getByRole('button', { name: /defaults/i }));
      await waitFor(() => {
        expect(screen.getByText('Default Session Settings')).toBeInTheDocument();
      });

      const dialog = screen.getByRole('dialog');
      const minPlayersInput = within(dialog).getByLabelText(/default minimum players/i);
      fireEvent.change(minPlayersInput, { target: { value: '5' } });

      const reminderInput = within(dialog).getByLabelText(/default reminder hours before/i);
      fireEvent.change(reminderInput, { target: { value: '72' } });

      // Click Save
      const saveBtn = within(dialog).getByRole('button', { name: /save defaults/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        const stored = localStorage.getItem('sessionDefaults');
        expect(stored).not.toBeNull();
        const parsed = JSON.parse(stored as string);
        expect(parsed.minimumPlayers).toBe(5);
        expect(parsed.reminderHours).toBe(72);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 9. View Attendance
  // -------------------------------------------------------------------------
  describe('View Attendance', () => {
    it('fetches detailed attendance and renders attendees in the dialog', async () => {
      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      // Click View Attendance on the first session card
      const viewButtons = screen.getAllByRole('button', { name: /view attendance details/i });
      fireEvent.click(viewButtons[0]);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/sessions/1/attendance/detailed');
      });

      // Dialog should appear with attendee data
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/attendance details:/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/alice \(aragorn\)/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/looking forward to it/i)).toBeInTheDocument();
      // 'bob' appears once in the dialog, even though it also appears in
      // session cards on the page background.
      expect(within(dialog).getByText(/^bob\s*$/i)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // 10. Announce Session
  // -------------------------------------------------------------------------
  describe('Announce Session', () => {
    it('clicking Announce sends POST /sessions/:id/announce and shows success', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { success: true } });

      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      // Announce icons are visible on upcoming + scheduled sessions only
      const announceButtons = screen.getAllByRole('button', { name: /post discord announcement/i });
      fireEvent.click(announceButtons[0]);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/sessions/1/announce');
      });

      await waitFor(() => {
        expect(
          screen.getByText('Session announcement posted successfully')
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 11. Send Reminder (non_responders)
  // -------------------------------------------------------------------------
  describe('Send Reminder', () => {
    it('sends POST /sessions/:id/remind with reminder_type=non_responders', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { success: true } });

      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      // Open reminder dialog from the first card
      const reminderButtons = screen.getAllByRole('button', { name: /send reminder/i });
      fireEvent.click(reminderButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Send Session Reminder')).toBeInTheDocument();
      });

      // Choose Non-responders only
      const nonRespondersRadio = screen.getByRole('radio', {
        name: /non-responders only/i,
      });
      fireEvent.click(nonRespondersRadio);

      // Click the dialog's Send Reminder button
      const dialog = screen.getByRole('dialog');
      const sendBtn = within(dialog).getByRole('button', { name: /^send reminder$/i });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/sessions/1/remind', {
          reminder_type: 'non_responders',
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Reminder sent successfully')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 12. Confirm Session (only when min players met)
  // -------------------------------------------------------------------------
  describe('Confirm Session', () => {
    it('clicking Confirm sends PUT /sessions/:id with status=confirmed', async () => {
      (api.put as any).mockResolvedValueOnce({ data: { success: true } });

      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Min Players Met Session')).toBeInTheDocument();
      });

      // The Confirm Session icon only appears when confirmed_count >= minimum_players,
      // so only session id=4 ("Min Players Met Session") qualifies in our fixtures.
      const confirmBtns = screen.getAllByRole('button', { name: /confirm session/i });
      expect(confirmBtns.length).toBe(1); // safety net: only one card has it
      fireEvent.click(confirmBtns[0]);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/sessions/4', { status: 'confirmed' });
      });

      await waitFor(() => {
        expect(
          screen.getByText('Session confirmed successfully')
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 13. Cancel Session
  // -------------------------------------------------------------------------
  describe('Cancel Session', () => {
    it('opens dialog, accepts a reason, and PUTs status=cancelled with cancel_reason', async () => {
      (api.put as any).mockResolvedValueOnce({ data: { success: true } });

      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      const cancelButtons = screen.getAllByRole('button', { name: /cancel session/i });
      fireEvent.click(cancelButtons[0]);

      const dialog = await screen.findByRole('dialog');
      const reasonInput = within(dialog).getByLabelText(/cancellation reason/i);
      fireEvent.change(reasonInput, { target: { value: 'Player illness' } });

      const confirmBtn = within(dialog).getByRole('button', {
        name: /^cancel session$/i,
      });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith('/sessions/1', {
          status: 'cancelled',
          cancel_reason: 'Player illness',
        });
      });
    });
  });

  // -------------------------------------------------------------------------
  // 14. Reinstate Cancelled Session
  // -------------------------------------------------------------------------
  describe('Reinstate Cancelled', () => {
    it('clicking Reinstate posts /sessions/:id/uncancel', async () => {
      (api.post as any).mockResolvedValueOnce({ data: { success: true } });

      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      // Show cancelled sessions
      fireEvent.click(screen.getByRole('button', { name: /filters/i }));
      fireEvent.click(screen.getByRole('checkbox', { name: /cancelled/i }));

      await waitFor(() => {
        expect(screen.getByText('Cancelled Session')).toBeInTheDocument();
      });

      const reinstateBtns = screen.getAllByRole('button', { name: /reinstate session/i });
      expect(reinstateBtns.length).toBe(1); // only the cancelled card has it
      fireEvent.click(reinstateBtns[0]);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/sessions/3/uncancel');
      });

      await waitFor(() => {
        expect(
          screen.getByText('Session has been reinstated')
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 15. Check Notifications
  // -------------------------------------------------------------------------
  describe('Check Notifications', () => {
    it('clicking the button posts /sessions/check-notifications', async () => {
      (api.post as any).mockResolvedValueOnce({
        data: { count: 0, results: [] },
      });

      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /check notifications/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/sessions/check-notifications');
      });

      await waitFor(() => {
        expect(
          screen.getByText('No sessions need notifications at this time')
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 16. Error path: rejected mutation surfaces an error message
  // -------------------------------------------------------------------------
  describe('Error path', () => {
    it('shows an error snackbar when announce fails', async () => {
      (api.post as any).mockRejectedValueOnce(new Error('boom'));

      renderSessionManagement();
      await waitFor(() => {
        expect(screen.getByText('Weekly Game Night')).toBeInTheDocument();
      });

      const announceButtons = screen.getAllByRole('button', {
        name: /post discord announcement/i,
      });
      fireEvent.click(announceButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Failed to post announcement')).toBeInTheDocument();
      });
    });
  });
});
