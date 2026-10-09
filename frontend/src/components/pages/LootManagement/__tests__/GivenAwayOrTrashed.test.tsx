import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

let mockIsDM = false;
vi.mock('../../../../contexts/CampaignContext', () => ({
  useIsDM: () => mockIsDM,
}));

const baseLootManagement = vi.fn(() => <div>base</div>);
vi.mock('../BaseLootManagement', () => ({
  default: (props: any) => baseLootManagement(props),
}));

import GivenAwayOrTrashed from '../GivenAwayOrTrashed';

const lastConfig = () => (baseLootManagement.mock.calls.at(-1) as any)[0].config;

describe('GivenAwayOrTrashed', () => {
  beforeEach(() => {
    baseLootManagement.mockClear();
  });

  it('is read-only for a player: no selection, no actions', () => {
    mockIsDM = false;
    render(<GivenAwayOrTrashed />);
    expect(screen.getByText('base')).toBeInTheDocument();
    expect(lastConfig().showColumns.select).toBe(false);
    expect(lastConfig().actions).toEqual([]);
  });

  it('lets a DM select trashed items and offers Restore', () => {
    mockIsDM = true;
    render(<GivenAwayOrTrashed />);
    expect(lastConfig().showColumns.select).toBe(true);
    expect(lastConfig().actions).toEqual([
      expect.objectContaining({ label: 'Restore', actionKey: 'restore' }),
    ]);
    expect(lastConfig().status).toBe('Trash');
  });
});
