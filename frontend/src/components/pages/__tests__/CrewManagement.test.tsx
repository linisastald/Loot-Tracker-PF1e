import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

// Mock crewService
vi.mock('../../../services/crewService', () => ({
  default: {
    getAllCrew: vi.fn().mockResolvedValue({
      data: {
        crew: [
          { id: 1, name: 'Barnabas Bligh', race: 'Human', age: 34, location_id: 1, location_type: 'ship', ship_position: 'Crew', hire_date: '4721-03-02' },
          { id: 2, name: 'Crimson Cogward', race: 'Human', age: 29, location_id: 1, location_type: 'ship', ship_position: 'Rigger' },
          // Outpost id 1 deliberately shares its id with ship id 1
          { id: 4, name: 'Dockhand Dune', race: 'Human', age: 40, location_id: 1, location_type: 'outpost', ship_position: null },
        ],
      },
    }),
    getDeceasedCrew: vi.fn().mockResolvedValue({
      data: {
        crew: [
          { id: 3, name: 'Badger Medlar', race: 'Half-Orc', death_date: '2024-01-01', last_known_location: 'The Wormwood' },
        ],
      },
    }),
    createCrew: vi.fn().mockResolvedValue({ data: {} }),
    updateCrew: vi.fn().mockResolvedValue({ data: {} }),
    deleteCrew: vi.fn().mockResolvedValue({ data: {} }),
    moveCrewToLocation: vi.fn().mockResolvedValue({ data: {} }),
    markCrewDead: vi.fn().mockResolvedValue({ data: {} }),
    markCrewDeparted: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock shipService
vi.mock('../../../services/shipService', () => ({
  default: {
    getAllShips: vi.fn().mockResolvedValue({
      data: {
        ships: [
          { id: 1, name: "Man's Promise", status: 'PC Active', type: 'ship' },
        ],
      },
    }),
  },
}));

// Mock outpostService
vi.mock('../../../services/outpostService', () => ({
  default: {
    getAllOutposts: vi.fn().mockResolvedValue({
      data: {
        outposts: [
          { id: 1, name: 'Tidewater Rock', type: 'outpost' },
        ],
      },
    }),
  },
}));

// Mock golarionDate utilities
vi.mock('../../../utils/golarionDate', () => ({
  getTodayInInputFormat: vi.fn().mockResolvedValue('4722-01-15'),
  golarionToInputFormat: vi.fn().mockReturnValue('4722-01-15'),
  inputFormatToGolarion: vi.fn().mockReturnValue({ year: 4722, month: 1, day: 15 }),
}));

// Mock raceData
vi.mock('../../../data/raceData', () => ({
  STANDARD_RACES: ['Human', 'Elf', 'Dwarf', 'Halfling', 'Half-Elf', 'Half-Orc', 'Gnome'],
  generateRandomName: vi.fn().mockReturnValue('Random Sailor'),
  generateRandomRace: vi.fn().mockReturnValue('Human'),
  generateRandomAge: vi.fn().mockReturnValue(25),
}));

// DM gating comes from the current campaign role
const campaign = vi.hoisted(() => ({ isDM: true }));
vi.mock('../../../contexts/CampaignContext', () => ({
  useIsDM: () => campaign.isDM,
}));

import CrewManagement from '../CrewManagement';
import crewService from '../../../services/crewService';

const renderCrewManagement = () => {
  return render(
    <BrowserRouter>
      <CrewManagement />
    </BrowserRouter>
  );
};

describe('CrewManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaign.isDM = true;
  });

  it('shows loading skeleton initially', () => {
    renderCrewManagement();

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('renders the Crew Management heading after loading', async () => {
    renderCrewManagement();

    await waitFor(() => {
      expect(screen.getByText('Crew Management')).toBeInTheDocument();
    });
  });

  it('renders Add Crew Member button after loading', async () => {
    renderCrewManagement();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Crew Member/i })).toBeInTheDocument();
    });
  });

  it('renders Recruit Crew button after loading', async () => {
    renderCrewManagement();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Recruit Crew/i })).toBeInTheDocument();
    });
  });

  it('renders Active Crew and Deceased/Departed tabs', async () => {
    renderCrewManagement();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Active Crew/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Deceased\/Departed/i })).toBeInTheDocument();
    });
  });

  it('renders crew member names in the table after loading', async () => {
    renderCrewManagement();

    await waitFor(() => {
      expect(screen.getByText('Barnabas Bligh')).toBeInTheDocument();
      expect(screen.getByText('Crimson Cogward')).toBeInTheDocument();
    });
  });

  it('renders crew table column headers', async () => {
    renderCrewManagement();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Race')).toBeInTheDocument();
      expect(screen.getByText('Location')).toBeInTheDocument();
      expect(screen.getByText('Position')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  it('shows ship location for crew members assigned to ships', async () => {
    renderCrewManagement();

    await waitFor(() => {
      // Both crew members are on Man's Promise
      const locationCells = screen.getAllByText("Man's Promise");
      expect(locationCells.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ship and outpost sharing the same id', () => {
    it('saves an edit of an outpost crew member with location_type outpost', async () => {
      const user = userEvent.setup();
      renderCrewManagement();
      const row = (await screen.findByText('Dockhand Dune')).closest('tr') as HTMLElement;
      await user.click(within(row).getByTitle('Edit'));
      // The dialog must preselect the outpost, not the ship with the same id
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText(/Location/)).toHaveValue('Tidewater Rock (Outpost)');
      await user.click(within(dialog).getByRole('button', { name: 'Update' }));
      await waitFor(() => expect(crewService.updateCrew).toHaveBeenCalled());
      expect(crewService.updateCrew).toHaveBeenCalledWith(
        4,
        expect.objectContaining({ location_type: 'outpost', location_id: 1 })
      );
    });

    it('moves a crew member to the outpost, not the same-id ship', async () => {
      const user = userEvent.setup();
      renderCrewManagement();
      const row = (await screen.findByText('Barnabas Bligh')).closest('tr') as HTMLElement;
      await user.click(within(row).getByTitle('Move'));
      const dialog = await screen.findByRole('dialog');
      // Crew is on ship 1: the same-id outpost must still be offered
      await user.click(within(dialog).getByLabelText(/New Location/));
      await user.click(await screen.findByRole('option', { name: /Tidewater Rock/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Move' }));
      await waitFor(() => expect(crewService.moveCrewToLocation).toHaveBeenCalled());
      expect(crewService.moveCrewToLocation).toHaveBeenCalledWith(1, 'outpost', 1, null);
    });
  });

  describe('mutations', () => {
    const openRowAction = async (user: ReturnType<typeof userEvent.setup>, name: string, title: string) => {
      const row = (await screen.findByText(name)).closest('tr') as HTMLElement;
      await user.click(within(row).getByTitle(title));
      return screen.findByRole('dialog');
    };

    it('creates a crew member on a ship', async () => {
      const user = userEvent.setup();
      renderCrewManagement();
      await user.click(await screen.findByRole('button', { name: /Add Crew Member/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/^Name/), 'Newbie Nate');
      await user.click(within(dialog).getByLabelText(/Location/));
      await user.click(await screen.findByRole('option', { name: /Man's Promise/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      await waitFor(() => expect(crewService.createCrew).toHaveBeenCalled());
      expect(crewService.createCrew).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Newbie Nate', location_type: 'ship', location_id: 1 })
      );
    });

    it('requires a location when creating', async () => {
      const user = userEvent.setup();
      renderCrewManagement();
      await user.click(await screen.findByRole('button', { name: /Add Crew Member/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/^Name/), 'No Home');
      await user.click(within(dialog).getByRole('button', { name: 'Create' }));

      // The error is rendered inside the dialog, not behind it
      expect(await within(dialog).findByText('Location is required')).toBeInTheDocument();
      expect(crewService.createCrew).not.toHaveBeenCalled();
    });

    it('shows the server error inside the dialog when a save fails', async () => {
      vi.mocked(crewService.updateCrew).mockRejectedValueOnce({
        response: { data: { message: 'Selected ship does not exist' } },
      });
      const user = userEvent.setup();
      renderCrewManagement();
      const dialog = await openRowAction(user, 'Barnabas Bligh', 'Edit');
      await user.click(within(dialog).getByRole('button', { name: 'Update' }));

      expect(await within(dialog).findByText('Selected ship does not exist')).toBeInTheDocument();
    });

    it('deletes a crew member after confirmation', async () => {
      const user = userEvent.setup();
      renderCrewManagement();
      const dialog = await openRowAction(user, 'Crimson Cogward', 'Delete');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(crewService.deleteCrew).toHaveBeenCalledWith(2));
    });

    it('marks a crew member dead with the Golarion date, not the real-world date', async () => {
      const user = userEvent.setup();
      renderCrewManagement();
      const dialog = await openRowAction(user, 'Barnabas Bligh', 'Update Status');
      await user.click(within(dialog).getByRole('button', { name: 'Update Status' }));

      await waitFor(() => expect(crewService.markCrewDead).toHaveBeenCalled());
      expect(crewService.markCrewDead).toHaveBeenCalledWith(1, '4722-01-15');
    });

    it('marks a crew member departed with a reason', async () => {
      const user = userEvent.setup();
      renderCrewManagement();
      const dialog = await openRowAction(user, 'Barnabas Bligh', 'Update Status');
      await user.click(within(dialog).getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'Departed' }));
      await user.type(within(dialog).getByLabelText(/Reason for Departure/), 'Deserted');
      await user.click(within(dialog).getByRole('button', { name: 'Update Status' }));

      await waitFor(() => expect(crewService.markCrewDeparted).toHaveBeenCalled());
      expect(crewService.markCrewDeparted).toHaveBeenCalledWith(1, '4722-01-15', 'Deserted');
    });

    it('lists deceased crew with the stored date shown verbatim', async () => {
      const user = userEvent.setup();
      renderCrewManagement();
      await user.click(await screen.findByRole('tab', { name: /Deceased\/Departed/i }));

      expect(await screen.findByText('Badger Medlar')).toBeInTheDocument();
      expect(screen.getByText('2024-01-01')).toBeInTheDocument();
      expect(screen.getByText('Deceased')).toBeInTheDocument();
    });
  });

  describe('recruitment', () => {
    const startRecruit = async (user: ReturnType<typeof userEvent.setup>, roll: string) => {
      await user.click(await screen.findByRole('button', { name: /Recruit Crew/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/Total Roll Result/), roll);
      await user.click(within(dialog).getByRole('button', { name: /Make Recruitment Check/i }));
      return dialog;
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('does not recruit when the roll misses the DC', async () => {
      const user = userEvent.setup();
      renderCrewManagement();
      const dialog = await startRecruit(user, '15');

      expect(await within(dialog).findByText(/Recruitment failed/)).toBeInTheDocument();
      expect(crewService.createCrew).not.toHaveBeenCalled();
    });

    it('recruits 1d4+2 crew on a successful roll, all at the chosen location', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0); // 1d4 = 1 -> 3 recruits
      const user = userEvent.setup();
      renderCrewManagement();
      await startRecruit(user, '22');

      await waitFor(() => expect(crewService.createCrew).toHaveBeenCalledTimes(3));
      expect(crewService.createCrew).toHaveBeenCalledWith(
        expect.objectContaining({
          location_type: 'ship',
          location_id: 1,
          ship_position: 'Crew',
          description: 'Convinced to join via Diplomacy check',
        })
      );
      expect(await screen.findByText(/You recruited 3 crew members/)).toBeInTheDocument();
    });

    it('reports how many recruits were added when a request fails midway', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      vi.mocked(crewService.createCrew)
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce({ response: { data: { message: 'boom' } } });
      const user = userEvent.setup();
      renderCrewManagement();
      await startRecruit(user, '22');

      expect(await screen.findByText(/Only 1 of 3 recruits were added/)).toBeInTheDocument();
      // The roster is refreshed so the partial batch is visible
      expect(crewService.getAllCrew).toHaveBeenCalledTimes(2);
    });
  });
});

describe('CrewManagement for a player (not a DM)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaign.isDM = false;
  });

  it('hides the delete control but keeps move, edit and status change', async () => {
    renderCrewManagement();
    await screen.findByText('Barnabas Bligh');
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
    expect(screen.getAllByTitle('Edit').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Move').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Update Status').length).toBeGreaterThan(0);
  });

  it('a player can still mark a crew member dead (a status change, not a delete)', async () => {
    const user = userEvent.setup();
    renderCrewManagement();
    await screen.findByText('Crimson Cogward');
    const row = screen.getByText('Crimson Cogward').closest('tr') as HTMLElement;
    await user.click(within(row).getByTitle('Update Status'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('CrewManagement for a DM', () => {
  it('shows the delete control on every row', async () => {
    campaign.isDM = true;
    renderCrewManagement();
    await screen.findByText('Barnabas Bligh');
    expect(screen.getAllByTitle('Delete')).toHaveLength(3);
  });
});

describe('CrewManagement hire date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    campaign.isDM = true;
  });

  it('shows the stored hire date in a Hired column, and a dash when there is none', async () => {
    renderCrewManagement();
    await screen.findByText('Barnabas Bligh');
    expect(screen.getByRole('columnheader', { name: 'Hired' })).toBeInTheDocument();
    const withDate = screen.getByText('Barnabas Bligh').closest('tr') as HTMLElement;
    expect(within(withDate).getByText('4721-03-02')).toBeInTheDocument();
    const without = screen.getByText('Crimson Cogward').closest('tr') as HTMLElement;
    expect(within(without).queryByText(/\d{4}-\d{2}-\d{2}/)).not.toBeInTheDocument();
  });

  it('prefills the edit dialog with the stored hire date and sends it back as a plain date string', async () => {
    const user = userEvent.setup();
    renderCrewManagement();
    const row = (await screen.findByText('Barnabas Bligh')).closest('tr') as HTMLElement;
    await user.click(within(row).getByTitle('Edit'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Hire Date')).toHaveValue('4721-03-02');
    await user.click(within(dialog).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(crewService.updateCrew).toHaveBeenCalled());
    expect(crewService.updateCrew).toHaveBeenCalledWith(1, expect.objectContaining({ hire_date: '4721-03-02' }));
  });

  it('leaves the field blank for a crew member with no hire date and sends null, not today', async () => {
    const user = userEvent.setup();
    renderCrewManagement();
    const row = (await screen.findByText('Crimson Cogward')).closest('tr') as HTMLElement;
    await user.click(within(row).getByTitle('Edit'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Hire Date')).toHaveValue('');
    await user.click(within(dialog).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(crewService.updateCrew).toHaveBeenCalled());
    expect(crewService.updateCrew).toHaveBeenCalledWith(2, expect.objectContaining({ hire_date: null }));
  });

  it('defaults a new crew member to the current Golarion date', async () => {
    const user = userEvent.setup();
    renderCrewManagement();
    await user.click(await screen.findByRole('button', { name: /Add Crew Member/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Hire Date')).toHaveValue('4722-01-15');
    await user.type(within(dialog).getByLabelText(/^Name/), 'Newbie Nate');
    await user.click(within(dialog).getByLabelText(/Location/));
    await user.click(await screen.findByRole('option', { name: /Man's Promise/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(crewService.createCrew).toHaveBeenCalled());
    expect(crewService.createCrew).toHaveBeenCalledWith(expect.objectContaining({ hire_date: '4722-01-15' }));
  });
});
