import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

const apiGet = vi.fn();
vi.mock('../../../utils/api', () => ({
  default: { get: (...args: unknown[]) => apiGet(...args) },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, activeCharacterId: 7 } }),
}));

vi.mock('../../../hooks/useCampaignTimezone', () => ({
  useCampaignTimezone: () => ({ timezone: 'UTC' }),
}));

let mobile = false;
vi.mock('../../../hooks/useIsMobile', () => ({
  useIsMobile: () => mobile,
}));

import CustomLootTable from '../CustomLootTable';

const summary = (overrides: Record<string, unknown> = {}) => ({
  row_type: 'summary',
  id: 1,
  name: 'Longsword',
  quantity: 2,
  type: 'weapon',
  size: 'Medium',
  unidentified: false,
  masterwork: false,
  statuspage: null,
  character_name: null,
  appraisals: [],
  ...overrides,
});

const individual = (id: number, overrides: Record<string, unknown> = {}) => ({
  row_type: 'individual',
  id,
  name: 'Longsword',
  quantity: 1,
  type: 'weapon',
  size: 'Medium',
  unidentified: false,
  masterwork: false,
  statuspage: null,
  ...overrides,
});

const baseProps = () => ({
  loot: [summary()],
  individualLoot: [individual(11), individual(12)],
  selectedItems: [] as number[],
  openItems: {},
  setOpenItems: vi.fn(),
  handleSelectItem: vi.fn(),
  sortConfig: { key: '', direction: 'asc' },
  setSortConfig: vi.fn(),
  showColumns: {
    select: true, quantity: true, name: true, type: true, size: true, whoHasIt: true,
    believedValue: true, averageAppraisal: true, sessionDate: false, lastUpdate: false,
    unidentified: true, pendingSale: true,
  },
});

const rowNames = () =>
  screen.getAllByRole('row').slice(1).map(r => within(r).queryAllByRole('cell')[2]?.textContent ?? '');

describe('CustomLootTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mobile = false;
    apiGet.mockResolvedValue({ data: [{ id: 7, name: 'Valeros' }, { id: 8, name: 'Seoni' }] });
  });

  it('loads active characters once and never requests /user/me per row', async () => {
    const props = baseProps();
    props.loot = [summary({ id: 1 }), summary({ id: 2, name: 'Dagger' }), summary({ id: 3, name: 'Mace' })];
    render(<CustomLootTable {...props} />);

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/user/active-characters'));
    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).not.toHaveBeenCalledWith('/user/me');
  });

  it("shows the active character's own appraisal as the believed value", () => {
    const props = baseProps();
    props.loot = [summary({
      appraisals: [
        { character_id: 8, character_name: 'Seoni', believedvalue: '99' },
        { character_id: 7, character_name: 'Valeros', believedvalue: '12.5' },
      ],
    })];
    render(<CustomLootTable {...props} />);

    expect(screen.getByText('12.50')).toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('shows no believed value when only other characters appraised the item', () => {
    const props = baseProps();
    props.loot = [summary({ appraisals: [{ character_id: 8, character_name: 'Seoni', believedvalue: '99' }] })];
    render(<CustomLootTable {...props} />);

    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  describe('grouping by status', () => {
    it('lists only the individual items with the same status as the summary row', () => {
      const props = baseProps();
      props.loot = [
        summary({ id: 1, statuspage: null }),
        summary({ id: 2, statuspage: 'Pending Sale' }),
      ];
      props.individualLoot = [
        individual(11, { statuspage: null }),
        individual(12, { statuspage: null }),
        individual(21, { statuspage: 'Pending Sale' }),
        individual(22, { statuspage: 'Pending Sale' }),
      ];
      props.handleSelectItem = vi.fn();
      render(<CustomLootTable {...props} />);

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]); // first summary row (status null)

      expect(props.handleSelectItem.mock.calls.map(c => c[0])).toEqual([11, 12]);
    });
  });

  describe('group selection', () => {
    it('selects every missing item of a partially selected group (does not invert)', () => {
      const props = baseProps();
      props.selectedItems = [11];
      render(<CustomLootTable {...props} />);

      fireEvent.click(screen.getAllByRole('checkbox')[0]);

      expect(props.handleSelectItem.mock.calls.map(c => c[0])).toEqual([12]);
    });

    it('clears the whole group when it is fully selected', () => {
      const props = baseProps();
      props.selectedItems = [11, 12];
      render(<CustomLootTable {...props} />);

      fireEvent.click(screen.getAllByRole('checkbox')[0]);

      expect(props.handleSelectItem.mock.calls.map(c => c[0])).toEqual([11, 12]);
    });

    it('selects all items of a group on mobile with the same rule', () => {
      mobile = true;
      const props = baseProps();
      props.selectedItems = [12];
      render(<CustomLootTable {...props} />);

      fireEvent.click(screen.getAllByRole('checkbox')[0]);

      expect(props.handleSelectItem.mock.calls.map(c => c[0])).toEqual([11]);
    });
  });

  describe('sorting', () => {
    const names = ['Alpha', 'Bravo', 'Charlie'];

    it('orders statuses consistently in both directions', () => {
      const props = baseProps();
      props.loot = [
        summary({ id: 1, name: names[0], statuspage: 'Pending Sale' }),
        summary({ id: 2, name: names[1], statuspage: 'Kept Party' }),
        summary({ id: 3, name: names[2], statuspage: 'Another' }),
      ];
      props.individualLoot = [];
      props.sortConfig = { key: 'statuspage', direction: 'asc' };
      const { unmount } = render(<CustomLootTable {...props} />);
      expect(rowNames().map(n => n.replace(/Well Made /, ''))).toEqual(['Charlie', 'Bravo', 'Alpha']);
      unmount();

      props.sortConfig = { key: 'statuspage', direction: 'desc' };
      render(<CustomLootTable {...props} />);
      expect(rowNames()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    });

    it('sorts by the active character believed value', () => {
      const props = baseProps();
      const appraised = (value: string) => [{ character_id: 7, character_name: 'Valeros', believedvalue: value }];
      props.loot = [
        summary({ id: 1, name: names[0], appraisals: appraised('30') }),
        summary({ id: 2, name: names[1], appraisals: appraised('5') }),
        summary({ id: 3, name: names[2], appraisals: appraised('100') }),
      ];
      props.individualLoot = [];
      props.sortConfig = { key: 'believedvalue', direction: 'asc' };
      render(<CustomLootTable {...props} />);

      expect(rowNames()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    });

    it('treats null like a missing value (sorts first ascending)', () => {
      const props = baseProps();
      props.loot = [
        summary({ id: 1, name: names[0], character_name: 'Zed' }),
        summary({ id: 2, name: names[1], character_name: null }),
      ];
      props.individualLoot = [];
      props.sortConfig = { key: 'character_name', direction: 'asc' };
      render(<CustomLootTable {...props} />);

      expect(rowNames()).toEqual(['Bravo', 'Alpha']);
    });
  });

  describe('filters', () => {
    it('Other type filter catches types without a filter of their own', async () => {
      const props = baseProps();
      props.loot = [
        summary({ id: 1, name: 'Sword', type: 'weapon' }),
        summary({ id: 2, name: 'Odd thing', type: 'wondrous' }),
        summary({ id: 3, name: 'Blank', type: null }),
      ];
      props.individualLoot = [];
      render(<CustomLootTable {...props} />);

      fireEvent.click(screen.getByRole('button', { name: /type filters/i }));
      // uncheck everything except Other
      for (const label of ['Weapon', 'Armor', 'Magic', 'Gear', 'Trade Good']) {
        fireEvent.click(screen.getByLabelText(label));
      }

      await waitFor(() => expect(screen.queryByText('Sword')).not.toBeInTheDocument());
      expect(screen.getByText('Odd thing')).toBeInTheDocument();
      expect(screen.getByText('Blank')).toBeInTheDocument();
    });

    it('filters by who has the item using the character list', async () => {
      const props = baseProps();
      props.loot = [
        summary({ id: 1, name: 'Mine', character_name: 'Valeros' }),
        summary({ id: 2, name: 'Theirs', character_name: 'Seoni' }),
      ];
      props.individualLoot = [];
      render(<CustomLootTable {...props} />);
      await waitFor(() => expect(apiGet).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('button', { name: /who has filters/i }));
      fireEvent.click(await screen.findByLabelText('Valeros'));

      await waitFor(() => expect(screen.queryByText('Theirs')).not.toBeInTheDocument());
      expect(screen.getByText('Mine')).toBeInTheDocument();
    });
  });
});
