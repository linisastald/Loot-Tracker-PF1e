import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock the api utility
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock useCampaignTimezone so the hook does not try to fetch via api
vi.mock('../../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({ timezone: 'America/New_York', loading: false, error: null }),
}));

// Mock formatInCampaignTimezone for deterministic date rendering
vi.mock('../../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: vi.fn((dateString: string) => {
    if (!dateString) return '';
    return `formatted:${dateString}`;
  }),
}));

import api from '../../../../utils/api';
import CharacterManagement from '../CharacterManagement';

interface CharacterFixture {
  id: number;
  name: string;
  username: string;
  user_id: number;
  active: boolean;
  appraisal_bonus: number;
  birthday: string | null;
  deathday: string | null;
}

interface UserFixture {
  id: number;
  username: string;
  role: string;
}

const mockCharacters: CharacterFixture[] = [
  {
    id: 1,
    name: 'Zara',
    username: 'alice',
    user_id: 10,
    active: true,
    appraisal_bonus: 5,
    birthday: '2000-01-15T00:00:00.000Z',
    deathday: null,
  },
  {
    id: 2,
    name: 'Aldric',
    username: 'bob',
    user_id: 11,
    active: false,
    appraisal_bonus: 2,
    birthday: '1995-06-30T00:00:00.000Z',
    deathday: '2024-12-01T00:00:00.000Z',
  },
  {
    id: 3,
    name: 'Mira',
    username: 'carol',
    user_id: 12,
    active: true,
    appraisal_bonus: 8,
    birthday: null,
    deathday: null,
  },
];

const mockUsers: UserFixture[] = [
  { id: 10, username: 'alice', role: 'Player' },
  { id: 11, username: 'bob', role: 'Player' },
  { id: 12, username: 'carol', role: 'Player' },
  { id: 99, username: 'dm_user', role: 'DM' },
];

const renderComponent = () =>
  render(
    <BrowserRouter>
      <CharacterManagement />
    </BrowserRouter>
  );

/**
 * Set up default api.get responses for the two requests issued on mount.
 * The api response interceptor unwraps the body, so callers see `{ data: <array> }`.
 */
const setupDefaultApiMocks = (
  characters: CharacterFixture[] = mockCharacters,
  users: UserFixture[] = mockUsers
) => {
  (api.get as any).mockImplementation((url: string) => {
    if (url === '/user/all-characters') {
      return Promise.resolve({ data: characters });
    }
    if (url === '/campaigns/current/members') {
      return Promise.resolve({
        data: { members: users.map((u) => ({ user_id: u.id, username: u.username, role: u.role })) },
      });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
};

/** Get the data row for a character by its visible name. */
const getCharacterRow = (name: string): HTMLTableRowElement => {
  const cell = screen.getByRole('cell', { name });
  const row = cell.closest('tr');
  if (!row) throw new Error(`Could not find row for character "${name}"`);
  return row as HTMLTableRowElement;
};

/** Get the visible character names in the order they appear in the rendered table. */
const getRenderedNamesInOrder = (): string[] => {
  const rows = document.querySelectorAll('tbody tr');
  return Array.from(rows).map((row) => {
    const firstCell = row.querySelector('td');
    return firstCell?.textContent || '';
  });
};

describe('CharacterManagement (DMSettings)', () => {
  beforeEach(() => {
    // mockReset clears both call history AND any queued one-time return values,
    // which is important for tests that rely on mockResolvedValueOnce / mockRejectedValueOnce.
    (api.get as any).mockReset();
    (api.put as any).mockReset();
    (api.post as any).mockReset();
    (api.delete as any).mockReset();
    setupDefaultApiMocks();
  });

  describe('initial fetch and render', () => {
    it('fetches characters and users on mount', async () => {
      renderComponent();

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/user/all-characters');
        expect(api.get).toHaveBeenCalledWith('/campaigns/current/members');
      });
    });

    it('does not call the superadmin-only /user/all endpoint', async () => {
      renderComponent();

      await screen.findByRole('cell', { name: 'Zara' });
      expect(api.get).not.toHaveBeenCalledWith('/user/all');
    });

    it('still renders characters when the member roster request fails', async () => {
      (api.get as any).mockImplementation((url: string) => {
        if (url === '/user/all-characters') {
          return Promise.resolve({ data: mockCharacters });
        }
        return Promise.reject(new Error('403'));
      });

      renderComponent();

      expect(await screen.findByRole('cell', { name: 'Zara' })).toBeInTheDocument();
      expect(screen.queryByText(/Error loading data/i)).not.toBeInTheDocument();
    });

    it('renders a row for each returned character', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('cell', { name: 'Zara' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'Aldric' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'Mira' })).toBeInTheDocument();
      });
    });

    it('renders all column headers', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^name/i })).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /^user/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^active/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /appraisal bonus/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^birthday/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^deathday/i })).toBeInTheDocument();
    });

    it('shows "Click on a character to edit" instructional text', async () => {
      renderComponent();
      expect(await screen.findByText('Click on a character to edit')).toBeInTheDocument();
    });

    it('shows error when the fetch fails', async () => {
      (api.get as any).mockRejectedValueOnce(new Error('boom'));
      renderComponent();
      expect(await screen.findByText(/error loading data/i)).toBeInTheDocument();
    });
  });

  describe('table sorting', () => {
    it('sorts characters by name ascending by default', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('cell', { name: 'Zara' })).toBeInTheDocument();
      });

      // Default sort is name asc
      expect(getRenderedNamesInOrder()).toEqual(['Aldric', 'Mira', 'Zara']);
    });

    it('toggles name sort to descending when the header is clicked', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('cell', { name: 'Zara' })).toBeInTheDocument();
      });

      // Initial: asc — clicking name once flips to desc
      fireEvent.click(screen.getByRole('button', { name: /^name/i }));

      await waitFor(() => {
        expect(getRenderedNamesInOrder()).toEqual(['Zara', 'Mira', 'Aldric']);
      });
    });

    it('sorts by appraisal_bonus when its header is clicked', async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByRole('cell', { name: 'Zara' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /appraisal bonus/i }));

      await waitFor(() => {
        // appraisal_bonus values: Aldric=2, Zara=5, Mira=8
        expect(getRenderedNamesInOrder()).toEqual(['Aldric', 'Zara', 'Mira']);
      });
    });
  });

  describe('calendar dates', () => {
    it('shows birthday and deathday as the stored calendar day, never shifted by a time zone', async () => {
      renderComponent();
      await screen.findByRole('cell', { name: 'Aldric' });

      const row = getCharacterRow('Aldric');
      expect(within(row).getByText('Jun 30, 1995')).toBeInTheDocument();
      expect(within(row).getByText('Dec 1, 2024')).toBeInTheDocument();
    });
  });

  describe('active character highlight', () => {
    it('applies the green outline style to active character rows', async () => {
      renderComponent();

      const activeRow = await screen.findByRole('cell', { name: 'Zara' }).then((cell) => cell.closest('tr')!);
      const inactiveRow = getCharacterRow('Aldric');

      // Active rows get inline outline / boxShadow / backgroundColor
      expect(activeRow).toHaveStyle({ outline: '2px solid #4caf50' });
      // Inactive rows do not get the green outline
      expect(inactiveRow.getAttribute('style') || '').not.toContain('rgb(76, 175, 80)');
      expect(inactiveRow.getAttribute('style') || '').not.toContain('#4caf50');
    });
  });

  describe('opening the edit dialog', () => {
    it('opens the dialog populated with the clicked character\'s values', async () => {
      renderComponent();

      const zaraRow = await screen.findByRole('cell', { name: 'Zara' }).then((c) => c.closest('tr')!);
      fireEvent.click(zaraRow);

      // Dialog should be open
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Update Character')).toBeInTheDocument();

      // Name field
      const nameInput = within(dialog).getByLabelText('Name') as HTMLInputElement;
      expect(nameInput.value).toBe('Zara');

      // Appraisal Bonus field
      const appraisalInput = within(dialog).getByLabelText('Appraisal Bonus') as HTMLInputElement;
      expect(appraisalInput.value).toBe('5');

      // Birthday is a calendar date: shown exactly as stored, in every time zone
      const birthdayInput = within(dialog).getByLabelText('Birthday') as HTMLInputElement;
      expect(birthdayInput.value).toBe('2000-01-15');

      // Deathday field empty (Zara has no deathday)
      const deathdayInput = within(dialog).getByLabelText('Deathday') as HTMLInputElement;
      expect(deathdayInput.value).toBe('');

      // Active checkbox checked
      const activeCheckbox = within(dialog).getByRole('checkbox', { name: /active character/i });
      expect(activeCheckbox).toBeChecked();
    });

    it('populates the user dropdown with the character\'s user_id', async () => {
      renderComponent();

      const zaraRow = await screen.findByRole('cell', { name: 'Zara' }).then((c) => c.closest('tr')!);
      fireEvent.click(zaraRow);

      const dialog = await screen.findByRole('dialog');

      // The Select displays the username for the matching user_id
      const userSelect = within(dialog).getByRole('combobox');
      expect(userSelect).toHaveTextContent('alice');
    });
  });

  describe('updating a character', () => {
    it('sends PUT to /user/update-any-character with the merged payload and closes dialog on success', async () => {
      (api.put as any).mockResolvedValueOnce({ data: { success: true } });

      renderComponent();

      const zaraRow = await screen.findByRole('cell', { name: 'Zara' }).then((c) => c.closest('tr')!);
      fireEvent.click(zaraRow);

      const dialog = await screen.findByRole('dialog');

      // Change the name
      const nameInput = within(dialog).getByLabelText('Name') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Zara the Bold' } });

      // Change appraisal bonus
      const appraisalInput = within(dialog).getByLabelText('Appraisal Bonus') as HTMLInputElement;
      fireEvent.change(appraisalInput, { target: { value: '7' } });

      // Toggle active off
      const activeCheckbox = within(dialog).getByRole('checkbox', { name: /active character/i });
      fireEvent.click(activeCheckbox);
      expect(activeCheckbox).not.toBeChecked();

      // Set deathday to a value
      const deathdayInput = within(dialog).getByLabelText('Deathday') as HTMLInputElement;
      fireEvent.change(deathdayInput, { target: { value: '2026-04-01' } });

      // After update, fetchData() is called again — return updated character list
      const updatedCharacters = mockCharacters.map((c) =>
        c.id === 1
          ? { ...c, name: 'Zara the Bold', appraisal_bonus: 7, active: false, deathday: '2026-04-01' }
          : c
      );
      setupDefaultApiMocks(updatedCharacters);

      // Click Update
      fireEvent.click(within(dialog).getByRole('button', { name: /^update$/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          '/user/update-any-character',
          expect.objectContaining({
            id: 1,
            name: 'Zara the Bold',
            appraisal_bonus: 7,
            active: false,
            deathday: '2026-04-01',
            user_id: 10,
          })
        );
      });

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Success alert appears
      expect(await screen.findByText('Character updated successfully')).toBeInTheDocument();

      // List reflects the change
      await waitFor(() => {
        expect(screen.getByRole('cell', { name: 'Zara the Bold' })).toBeInTheDocument();
      });
    });

    it('sends an empty string for cleared date fields', async () => {
      (api.put as any).mockResolvedValueOnce({ data: { success: true } });

      renderComponent();

      // Aldric has both birthday and deathday; clear them
      const aldricRow = await screen.findByRole('cell', { name: 'Aldric' }).then((c) => c.closest('tr')!);
      fireEvent.click(aldricRow);

      const dialog = await screen.findByRole('dialog');

      const birthdayInput = within(dialog).getByLabelText('Birthday') as HTMLInputElement;
      const deathdayInput = within(dialog).getByLabelText('Deathday') as HTMLInputElement;

      expect(birthdayInput.value).toBe('1995-06-30');
      expect(deathdayInput.value).toBe('2024-12-01');

      fireEvent.change(birthdayInput, { target: { value: '' } });
      fireEvent.change(deathdayInput, { target: { value: '' } });

      fireEvent.click(within(dialog).getByRole('button', { name: /^update$/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          '/user/update-any-character',
          expect.objectContaining({
            id: 2,
            birthday: '',
            deathday: '',
          })
        );
      });
    });

    it('includes a changed user_id in the PUT payload', async () => {
      (api.put as any).mockResolvedValueOnce({ data: { success: true } });

      renderComponent();

      const zaraRow = await screen.findByRole('cell', { name: 'Zara' }).then((c) => c.closest('tr')!);
      fireEvent.click(zaraRow);

      const dialog = await screen.findByRole('dialog');

      // Open the user dropdown
      const userSelect = within(dialog).getByRole('combobox');
      fireEvent.mouseDown(userSelect);

      // Every member of this campaign is a choice, whatever their campaign role
      expect(await screen.findByRole('option', { name: 'dm_user' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('option', { name: 'bob' }));

      fireEvent.click(within(dialog).getByRole('button', { name: /^update$/i }));

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          '/user/update-any-character',
          expect.objectContaining({
            id: 1,
            user_id: 11,
          })
        );
      });
    });

    it('sends only the editable fields, with the bonus as a number (a cleared bonus is 0)', async () => {
      (api.put as any).mockResolvedValueOnce({ data: { success: true } });
      renderComponent();

      const zaraRow = await screen.findByRole('cell', { name: 'Zara' }).then((c) => c.closest('tr')!);
      fireEvent.click(zaraRow);
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText('Appraisal Bonus'), { target: { value: '' } });
      fireEvent.click(within(dialog).getByRole('button', { name: /^update$/i }));

      await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
      expect((api.put as any).mock.calls[0][1]).toEqual({
        id: 1,
        name: 'Zara',
        appraisal_bonus: 0,
        birthday: '2000-01-15',
        deathday: '',
        active: true,
        user_id: 10,
      });
    });

    it('keeps a former member selectable as the owner so the select is never blank', async () => {
      setupDefaultApiMocks(mockCharacters, mockUsers.filter((u) => u.id !== 10));
      renderComponent();

      const zaraRow = await screen.findByRole('cell', { name: 'Zara' }).then((c) => c.closest('tr')!);
      fireEvent.click(zaraRow);
      const dialog = await screen.findByRole('dialog');

      expect(within(dialog).getByRole('combobox')).toHaveTextContent('alice (not a member)');
    });

    it('shows the server message inside the dialog when the update is rejected', async () => {
      (api.put as any).mockRejectedValueOnce({ response: { data: { message: 'Character name already exists' } } });
      renderComponent();

      const zaraRow = await screen.findByRole('cell', { name: 'Zara' }).then((c) => c.closest('tr')!);
      fireEvent.click(zaraRow);
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: /^update$/i }));

      expect(await within(dialog).findByText('Character name already exists')).toBeInTheDocument();
    });

    it('shows an error and keeps the dialog open when the PUT fails', async () => {
      (api.put as any).mockRejectedValueOnce(new Error('server error'));

      renderComponent();

      const zaraRow = await screen.findByRole('cell', { name: 'Zara' }).then((c) => c.closest('tr')!);
      fireEvent.click(zaraRow);

      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: /^update$/i }));

      await waitFor(() => {
        expect(screen.getByText(/error updating character/i)).toBeInTheDocument();
      });

      // Dialog stays open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders the table without data rows when no characters are returned', async () => {
      setupDefaultApiMocks([], mockUsers);
      renderComponent();

      // The instructional text still appears once data has loaded
      expect(await screen.findByText('Click on a character to edit')).toBeInTheDocument();

      // No data rows
      const dataRows = document.querySelectorAll('tbody tr');
      expect(dataRows.length).toBe(0);

      // Header still rendered
      expect(screen.getByRole('button', { name: /^name/i })).toBeInTheDocument();
    });
  });
});
