import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Mock the api utility (4 levels up from this __tests__ folder)
vi.mock('../../../../utils/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Pin the campaign timezone hook so the summary date column is deterministic.
// US/Pacific is intentionally west of UTC so that the regression case below
// (UTC midnight ISO string) renders to a visibly different *local* day,
// proving the detail fetch must NOT use local-day extraction.
vi.mock('../../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({ timezone: 'America/Los_Angeles', loading: false }),
}));

vi.mock('../../../../utils/timezoneUtils', () => ({
  formatInCampaignTimezone: (iso: string) => `formatted:${iso}`,
}));

import api from '../../../../utils/api';
import SoldLoot from '../SoldLoot';

const renderSoldLoot = () =>
  render(
    <BrowserRouter>
      <SoldLoot />
    </BrowserRouter>
  );

describe('SoldLoot', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the Total Sold tile and an empty-state message when there are no records', async () => {
    (api.get as any).mockResolvedValueOnce({
      success: true,
      message: 'Sold items retrieved successfully',
      data: { records: [], total: 0, count: 0 },
    });
    renderSoldLoot();
    await waitFor(() => {
      expect(screen.getByText('Total Sold: 0.00 GP')).toBeInTheDocument();
    });
    expect(screen.getByText('No sold items found')).toBeInTheDocument();
  });

  it('renders summary rows from the records payload', async () => {
    (api.get as any).mockResolvedValueOnce({
      success: true,
      message: 'Sold items retrieved successfully',
      data: {
        records: [
          { soldon: '2026-04-25T00:00:00.000Z', number_of_items: '3', total: '702.5' },
        ],
        total: 702.5,
        count: 1,
      },
    });
    renderSoldLoot();
    await waitFor(() => {
      expect(
        screen.getByText('formatted:2026-04-25T00:00:00.000Z')
      ).toBeInTheDocument();
    });
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('702.5')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Regression: the detail fetch URL must use the UTC date the row was stored
  // under (i.e. the first 10 chars of the ISO string), NOT the viewer's local
  // date. Previously the component called `new Date(soldon).getDate()` which
  // for users west of UTC turned "2026-04-25T00:00:00Z" into "2026-04-24",
  // causing /sold/2026-04-24 to 404 because the real row is on 2026-04-25.
  // -------------------------------------------------------------------------
  it('fetches details using the UTC date from the ISO soldon, not the local date', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/sold') {
        return Promise.resolve({
          success: true,
          message: 'Sold items retrieved successfully',
          data: {
            records: [
              {
                soldon: '2026-04-25T00:00:00.000Z',
                number_of_items: '3',
                total: '702.5',
              },
            ],
            total: 702.5,
            count: 1,
          },
        });
      }
      if (url === '/sold/2026-04-25') {
        return Promise.resolve({
          success: true,
          message: 'Retrieved 1 items sold on 2026-04-25',
          data: [
            {
              id: 99,
              session_date: '2026-04-20T00:00:00.000Z',
              quantity: 1,
              name: 'Magic Sword',
              soldfor: 500,
            },
          ],
        });
      }
      // Any other URL — including the buggy /sold/2026-04-24 — should not be hit.
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    renderSoldLoot();
    await waitFor(() => {
      expect(screen.getByLabelText('expand row')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('expand row'));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/sold/2026-04-25');
    });
    // The buggy local-date URL must never appear.
    const buggyCalls = (api.get as any).mock.calls.filter(
      (c: any[]) => c[0] === '/sold/2026-04-24'
    );
    expect(buggyCalls.length).toBe(0);

    await waitFor(() => {
      expect(screen.getByText('Magic Sword')).toBeInTheDocument();
    });
  });
});
