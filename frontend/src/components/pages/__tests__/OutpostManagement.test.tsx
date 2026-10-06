import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../../services/outpostService', () => ({
  default: {
    getAllOutposts: vi.fn().mockResolvedValue({ data: { outposts: [] } }),
    createOutpost: vi.fn(),
    updateOutpost: vi.fn(),
    deleteOutpost: vi.fn(),
  },
}));

vi.mock('../../../services/crewService', () => ({
  default: {
    getCrewByLocation: vi.fn().mockResolvedValue({ data: { crew: [] } }),
  },
}));

vi.mock('../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: vi.fn().mockReturnValue('May 10, 2024'),
}));

import OutpostManagement from '../OutpostManagement';
import outpostService from '../../../services/outpostService';
import crewService from '../../../services/crewService';
import { formatInCampaignTimezone } from '../../../utils/timezoneUtils';

const fort = {
  id: 1,
  name: 'Fort Rannick',
  location: 'Hook Mountain',
  access_date: '2024-05-10',
  crew_count: 5,
};
const thistle = { id: 2, name: 'Thistletop', location: null, access_date: null, crew_count: 0 };

const renderComponent = () =>
  render(
    <BrowserRouter>
      <OutpostManagement />
    </BrowserRouter>
  );

const withOutposts = (...outposts: unknown[]) =>
  vi.mocked(outpostService.getAllOutposts).mockResolvedValue({ data: { outposts } });

describe('OutpostManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withOutposts();
  });

  it('renders loading state initially', () => {
    renderComponent();
    expect(screen.getByText('Loading outposts...')).toBeInTheDocument();
  });

  it('renders outpost management heading after loading', async () => {
    renderComponent();
    const heading = await screen.findByText('Outpost Management');
    expect(heading).toBeInTheDocument();
  });

  it('renders Add Outpost button', async () => {
    renderComponent();
    const button = await screen.findByRole('button', { name: /add outpost/i });
    expect(button).toBeInTheDocument();
  });

  it('renders Outpost List and Outpost Details tabs', async () => {
    renderComponent();
    expect(await screen.findByRole('tab', { name: /outpost list/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /outpost details/i })).toBeInTheDocument();
  });

  it('renders table column headers', async () => {
    renderComponent();
    expect(await screen.findByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Access Date')).toBeInTheDocument();
    expect(screen.getByText('Crew')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('calls outpostService.getAllOutposts on mount', async () => {
    renderComponent();
    await screen.findByText('Outpost Management');
    expect(outpostService.getAllOutposts).toHaveBeenCalledTimes(1);
  });

  it('renders outpost data when returned', async () => {
    withOutposts(fort);
    renderComponent();
    expect(await screen.findByText('Fort Rannick')).toBeInTheDocument();
    expect(screen.getByText('Hook Mountain')).toBeInTheDocument();
  });

  it('shows error when fetch fails', async () => {
    vi.mocked(outpostService.getAllOutposts).mockRejectedValueOnce(new Error('fail'));
    renderComponent();
    expect(await screen.findByText('Failed to load outposts')).toBeInTheDocument();
  });

  it('formats the access date as a calendar date in UTC, not the campaign timezone', async () => {
    withOutposts(fort, thistle);
    renderComponent();
    await screen.findByText('Fort Rannick');

    expect(formatInCampaignTimezone).toHaveBeenCalledWith('2024-05-10T00:00:00Z', 'UTC', 'PP');
    // An outpost without an access date shows Unknown (location and date)
    expect(within(screen.getByText('Thistletop').closest('tr') as HTMLElement).getAllByText('Unknown')).toHaveLength(2);
  });

  it('creates an outpost and refetches the list', async () => {
    const user = userEvent.setup();
    vi.mocked(outpostService.createOutpost).mockResolvedValue({ data: {} });
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /add outpost/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Outpost Name/i), 'Sandspit');
    await user.type(within(dialog).getByLabelText(/^Location/i), 'Southern coast');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(outpostService.createOutpost).toHaveBeenCalledWith({
      name: 'Sandspit', location: 'Southern coast', access_date: null,
    }));
    expect(await screen.findByText('Outpost created successfully')).toBeInTheDocument();
    expect(outpostService.getAllOutposts).toHaveBeenCalledTimes(2);
  });

  it('refuses to save a blank name', async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /add outpost/i }));

    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Outpost name is required')).toBeInTheDocument();
    expect(outpostService.createOutpost).not.toHaveBeenCalled();
  });

  it('shows the server message inside the open dialog when a save fails', async () => {
    const user = userEvent.setup();
    vi.mocked(outpostService.createOutpost).mockRejectedValue({
      response: { data: { message: 'Access date must be a valid date (YYYY-MM-DD)' } },
    });
    renderComponent();
    await user.click(await screen.findByRole('button', { name: /add outpost/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Outpost Name/i), 'Sandspit');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await within(dialog).findByText('Access date must be a valid date (YYYY-MM-DD)')).toBeInTheDocument();
  });

  it('edits an outpost, prefilling the stored date, and refreshes the details tab', async () => {
    const user = userEvent.setup();
    withOutposts(fort);
    vi.mocked(outpostService.updateOutpost).mockResolvedValue({ data: {} });
    renderComponent();
    await screen.findByText('Fort Rannick');

    // Open the details tab for the outpost, then edit it from the list
    await user.click(screen.getByTitle('View Details'));
    expect(await screen.findByText('Location: Hook Mountain')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /outpost list/i }));
    await user.click(screen.getByTitle('Edit'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Access Date/i)).toHaveValue('2024-05-10');

    withOutposts({ ...fort, location: 'Moved' });
    const location = within(dialog).getByLabelText(/^Location/i);
    await user.clear(location);
    await user.type(location, 'Moved');
    await user.click(within(dialog).getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(outpostService.updateOutpost).toHaveBeenCalledWith(1, {
      name: 'Fort Rannick', location: 'Moved', access_date: '2024-05-10',
    }));
    await user.click(await screen.findByRole('tab', { name: /outpost details/i }));
    expect(await screen.findByText('Location: Moved')).toBeInTheDocument();
  });

  it('deletes an outpost after confirmation and drops the details tab selection', async () => {
    const user = userEvent.setup();
    withOutposts(fort);
    vi.mocked(outpostService.deleteOutpost).mockResolvedValue({ data: {} });
    renderComponent();
    await screen.findByText('Fort Rannick');
    await user.click(screen.getByTitle('View Details'));
    await screen.findByText('Outpost Information');
    await user.click(screen.getByRole('tab', { name: /outpost list/i }));

    await user.click(screen.getByTitle('Delete'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Are you sure you want to delete "Fort Rannick"/)).toBeInTheDocument();
    withOutposts();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(outpostService.deleteOutpost).toHaveBeenCalledWith(1));
    expect(await screen.findByText('Outpost deleted successfully')).toBeInTheDocument();
    expect(outpostService.getAllOutposts).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /outpost details/i })).toBeDisabled();
  });

  it('keeps the outpost and reports the server message when delete fails', async () => {
    const user = userEvent.setup();
    withOutposts(fort);
    vi.mocked(outpostService.deleteOutpost).mockRejectedValue({ response: { data: { message: 'Outpost not found' } } });
    renderComponent();
    await screen.findByText('Fort Rannick');

    await user.click(screen.getByTitle('Delete'));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Outpost not found')).toBeInTheDocument();
    expect(screen.getByText('Fort Rannick')).toBeInTheDocument();
  });

  it('loads the crew stationed at an outpost for the details tab', async () => {
    const user = userEvent.setup();
    withOutposts(fort);
    vi.mocked(crewService.getCrewByLocation).mockResolvedValue({
      data: { crew: [{ id: 9, name: 'Ameiko', race: 'Human' }] },
    });
    renderComponent();
    await screen.findByText('Fort Rannick');

    await user.click(screen.getByTitle('View Details'));

    expect(crewService.getCrewByLocation).toHaveBeenCalledWith('outpost', 1);
    expect(await screen.findByText('Ameiko')).toBeInTheDocument();
    expect(screen.getByText('1 crew members stationed')).toBeInTheDocument();
  });
});
