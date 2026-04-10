import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

vi.mock('../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({ timezone: 'America/New_York', loading: false }),
}));

vi.mock('../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: vi.fn().mockReturnValue('Jan 1, 2025'),
}));

import OutpostManagement from '../OutpostManagement';
import outpostService from '../../../services/outpostService';

const renderComponent = () =>
  render(
    <BrowserRouter>
      <OutpostManagement />
    </BrowserRouter>
  );

describe('OutpostManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(outpostService.getAllOutposts).mockResolvedValueOnce({
      data: {
        outposts: [
          {
            id: 1,
            name: 'Fort Rannick',
            location: 'Hook Mountain',
            established_date: '2025-01-01',
            status: 'Active',
            access_date: '2025-01-01',
            crew_count: 5,
          },
        ],
      },
    });
    renderComponent();
    expect(await screen.findByText('Fort Rannick')).toBeInTheDocument();
  });

  it('shows error when fetch fails', async () => {
    vi.mocked(outpostService.getAllOutposts).mockRejectedValueOnce(new Error('fail'));
    renderComponent();
    expect(await screen.findByText('Failed to load outposts')).toBeInTheDocument();
  });
});
