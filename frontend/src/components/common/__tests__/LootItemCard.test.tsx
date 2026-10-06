import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('../lootFormatters', () => ({
  FormatAverageAppraisal: () => <span>avg-value</span>,
  FormatBelievedValue: () => <span>believed-value</span>,
  formatLootDate: (d: string) => `date:${d}`,
}));

import LootItemCard from '../LootItemCard';

const baseProps = () => ({
  item: {
    id: 1,
    name: 'Longsword',
    quantity: 3,
    masterwork: true,
    unidentified: true,
    statuspage: 'Pending Sale',
    type: 'weapon',
    size: 'Medium',
    character_name: 'Valeros',
    average_appraisal: 12,
    session_date: '2025-01-15',
    notes: '',
  },
  individualItems: [] as any[],
  isOpen: false,
  onToggleOpen: vi.fn(),
  onSelectAll: vi.fn(),
  onSelectItem: vi.fn(),
  selectedItems: [] as number[],
  selection: { allSelected: false, someSelected: false },
  showColumns: {
    select: true, type: true, size: true, whoHasIt: true,
    believedValue: true, averageAppraisal: true, sessionDate: true,
  } as Record<string, boolean>,
});

describe('LootItemCard', () => {
  it('shows the name, quantity and status chips', () => {
    render(<LootItemCard {...baseProps()} />);

    expect(screen.getByText('Well Made Longsword')).toBeInTheDocument();
    expect(screen.getByText('x3')).toBeInTheDocument();
    expect(screen.getByText('Unidentified')).toBeInTheDocument();
    expect(screen.getByText('Pending Sale')).toBeInTheDocument();
  });

  it('shows the enabled meta columns', () => {
    render(<LootItemCard {...baseProps()} />);

    for (const text of ['weapon', 'Medium', 'Valeros', 'date:2025-01-15']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText('believed-value')).toBeInTheDocument();
    expect(screen.getByText('avg-value')).toBeInTheDocument();
  });

  it('hides meta columns that are switched off and chips that do not apply', () => {
    const props = baseProps();
    props.showColumns = { select: false };
    props.item = { ...props.item, quantity: 1, unidentified: false, statuspage: 'Kept Party' };
    render(<LootItemCard {...props} />);

    expect(screen.queryByText('weapon')).not.toBeInTheDocument();
    expect(screen.queryByText('Valeros')).not.toBeInTheDocument();
    expect(screen.queryByText('x1')).not.toBeInTheDocument();
    expect(screen.queryByText('Unidentified')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
