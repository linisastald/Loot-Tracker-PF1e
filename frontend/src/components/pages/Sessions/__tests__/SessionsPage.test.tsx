import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const enqueueSnackbar = vi.fn();
vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar }),
}));

vi.mock('../../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({ timezone: 'UTC', loading: false, error: null }),
}));

import SessionsPage from '../SessionsPage';
import api from '../../../../utils/api';

const daysFromNow = (days: number, hour = 18) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const makeSession = (over: Record<string, unknown> = {}) => ({
  id: 1,
  title: 'Skull Night',
  status: 'scheduled',
  start_time: daysFromNow(3, 18).toISOString(),
  end_time: daysFromNow(3, 22).toISOString(),
  confirmed_count: '2',
  maybe_count: '0',
  declined_count: '0',
  confirmed_names: 'Valeros, Seelah',
  maybe_names: null,
  declined_names: null,
  user_status: null,
  user_response_type: null,
  user_character_id: null,
  ...over,
});

const CHARACTERS = [
  { id: 5, name: 'Valeros', active: true },
  { id: 6, name: 'Seelah', active: true },
  { id: 7, name: 'Retired', active: false },
];

const mockApi = (sessions: unknown[], enhancedFails = false) => {
  vi.mocked(api.get).mockImplementation((async (url: string) => {
    if (url === '/sessions/enhanced') {
      if (enhancedFails) throw new Error('enhanced down');
      return { success: true, data: sessions };
    }
    if (url === '/sessions') return { success: true, data: sessions };
    if (url === '/user/characters') return { data: CHARACTERS };
    return { data: [] };
  }) as never);
};

const openDialog = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Update Attendance' }));
  return screen.findByRole('dialog');
};

const YES = "Yes, I'll be there";
const LATE = "Yes, but I'll be late";
const NO = "No, I can't make it";

describe('SessionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.post).mockResolvedValue({ success: true } as never);
  });

  it('lists sessions from the enhanced endpoint with attendance names', async () => {
    mockApi([makeSession()]);
    render(<SessionsPage />);

    expect(await screen.findByText('Skull Night')).toBeInTheDocument();
    expect(screen.getByText(/Valeros, Seelah/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/sessions/enhanced');
  });

  it('says "No responses yet" when the counts arrive as the string "0"', async () => {
    mockApi([makeSession({ confirmed_count: '0', confirmed_names: null })]);
    render(<SessionsPage />);

    expect(await screen.findByText('No responses yet')).toBeInTheDocument();
  });

  it('falls back to the plain session list when the enhanced endpoint fails', async () => {
    mockApi([makeSession({ confirmed_count: undefined, confirmed_names: undefined })], true);
    render(<SessionsPage />);

    expect(await screen.findByText('Skull Night')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/sessions');
  });

  it('shows an error when both session endpoints fail', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('down') as never);
    render(<SessionsPage />);

    expect(await screen.findByText('Failed to load sessions. Please try again.')).toBeInTheDocument();
  });

  it('hides cancelled sessions by default and reports when nothing matches', async () => {
    mockApi([makeSession({ status: 'cancelled', cancel_reason: 'Sick' })]);
    render(<SessionsPage />);

    expect(await screen.findByText('No sessions match your filters')).toBeInTheDocument();
    expect(screen.queryByText('Skull Night')).not.toBeInTheDocument();
  });

  it('reveals cancelled sessions when the Cancelled filter is ticked', async () => {
    mockApi([makeSession({ status: 'cancelled', cancel_reason: 'Sick' })]);
    render(<SessionsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Filters/ }));
    fireEvent.click(screen.getByLabelText('Cancelled'));

    expect(await screen.findByText('This session has been cancelled')).toBeInTheDocument();
    expect(screen.getByText(/Reason: Sick/)).toBeInTheDocument();
  });

  it('shows the user own response as "Your Status" (F-1412)', async () => {
    mockApi([
      makeSession({ id: 1, title: 'Yes Night', user_status: 'accepted', user_response_type: 'yes' }),
      makeSession({ id: 2, title: 'No Night', user_status: 'declined', user_response_type: 'no' }),
      makeSession({ id: 3, title: 'Maybe Night', user_status: 'tentative', user_response_type: 'maybe' }),
      makeSession({ id: 4, title: 'Silent Night' }),
    ]);
    render(<SessionsPage />);

    await screen.findByText('Yes Night');
    const statusOf = (title: string) => {
      const card = screen.getByText(title).closest('.MuiCard-root') as HTMLElement;
      return within(card).getByText(/Your Status/).textContent;
    };
    expect(statusOf('Yes Night')).toBe('Your Status: Attending');
    expect(statusOf('No Night')).toBe('Your Status: Not Attending');
    expect(statusOf('Maybe Night')).toBe('Your Status: Maybe Attending');
    expect(statusOf('Silent Night')).toBe('Your Status: Not Responded');
  });

  it('prefills the dialog from the user existing response (F-1412)', async () => {
    mockApi([makeSession({ user_status: 'accepted', user_response_type: 'late', user_character_id: 6 })]);
    render(<SessionsPage />);

    const dialog = await openDialog();
    expect(within(dialog).getByLabelText(LATE)).toBeChecked();
    expect(within(dialog).getByRole('combobox')).toHaveTextContent('Seelah');
  });

  it('defaults to Yes with the first active character when there is no response yet', async () => {
    mockApi([makeSession()]);
    render(<SessionsPage />);

    const dialog = await openDialog();
    expect(within(dialog).getByLabelText(YES)).toBeChecked();
    expect(within(dialog).getByRole('combobox')).toHaveTextContent('Valeros');
  });

  it('submits a yes response to the detailed endpoint and refreshes the list', async () => {
    mockApi([makeSession()]);
    render(<SessionsPage />);

    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText(/Notes/), { target: { value: 'Bringing pizza' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/sessions/1/attendance/detailed', {
      response_type: 'yes',
      character_id: 5,
      notes: 'Bringing pizza',
      late_arrival_time: null,
      early_departure_time: null,
    });
    await waitFor(() =>
      expect(enqueueSnackbar).toHaveBeenCalledWith('Attendance updated successfully', { variant: 'success' })
    );
    await waitFor(() =>
      expect(vi.mocked(api.get).mock.calls.filter(c => c[0] === '/sessions/enhanced')).toHaveLength(2)
    );
  });

  it('sends no character for a decline', async () => {
    mockApi([makeSession()]);
    render(<SessionsPage />);

    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByLabelText(NO));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({ response_type: 'no', character_id: null });
  });

  it('collects late arrival as a 24-hour time input and sends HH:MM (F-1414)', async () => {
    mockApi([makeSession()]);
    render(<SessionsPage />);

    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByLabelText(LATE));
    const timeInput = within(dialog).getByLabelText(/Arrival Time/) as HTMLInputElement;
    expect(timeInput.type).toBe('time');
    fireEvent.change(timeInput, { target: { value: '19:30' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({
      response_type: 'late',
      late_arrival_time: '19:30',
    });
  });

  it('shows the server message on failure and does not re-post to the legacy endpoint (F-1414)', async () => {
    mockApi([makeSession()]);
    vi.mocked(api.post).mockRejectedValue({ response: { status: 400, data: { message: 'Invalid time format' } } } as never);
    render(<SessionsPage />);

    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(enqueueSnackbar).toHaveBeenCalledWith('Invalid time format', { variant: 'error' }));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.post).mock.calls[0][0]).toBe('/sessions/1/attendance/detailed');
  });
});
