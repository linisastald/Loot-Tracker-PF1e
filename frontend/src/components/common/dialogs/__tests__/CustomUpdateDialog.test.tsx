import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
// @ts-expect-error - JSX component without type declarations
import CustomUpdateDialog from '../CustomUpdateDialog';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onUpdateChange: vi.fn(),
  onUpdateSubmit: vi.fn(),
  updatedEntry: { id: 1, name: 'Ring', quantity: 1, unidentified: true },
};

describe('CustomUpdateDialog unidentified lock (F-1373)', () => {
  it('disables the Magical? select and shows a hint when locked', () => {
    render(<CustomUpdateDialog {...baseProps} lockUnidentified />);
    expect(screen.getByText('Use Identify to identify this item.')).toBeInTheDocument();
    const select = screen.getAllByRole('combobox')[0];
    expect(select).toHaveAttribute('aria-disabled', 'true');
  });

  it('leaves the select enabled and shows no hint for DMs', () => {
    render(<CustomUpdateDialog {...baseProps} />);
    expect(screen.queryByText('Use Identify to identify this item.')).not.toBeInTheDocument();
    const select = screen.getAllByRole('combobox')[0];
    expect(select).not.toHaveAttribute('aria-disabled', 'true');
  });
});

describe('CustomUpdateDialog value handling (F-1028, F-1029, F-1030)', () => {
  const openSelect = (index: number) => fireEvent.mouseDown(screen.getAllByRole('combobox')[index]);

  it('offers lowercase item types (as stored by Loot Entry) with capitalized labels', () => {
    render(<CustomUpdateDialog {...baseProps} updatedEntry={{ id: 1, type: 'trade good' }} />);
    expect(screen.getAllByRole('combobox')[2]).toHaveTextContent('Trade Good');
    openSelect(2);
    const option = within(screen.getByRole('listbox')).getByText('Weapon');
    expect(option).toHaveAttribute('data-value', 'weapon');
  });

  it('shows a legacy capitalized type (saved by the old dialog) as the matching option', () => {
    render(<CustomUpdateDialog {...baseProps} updatedEntry={{ id: 1, type: 'Trade Good' }} />);
    expect(screen.getAllByRole('combobox')[2]).toHaveTextContent('Trade Good');
  });

  it('shows Not Magical when unidentified is null and reports null back when it is picked', () => {
    const onUpdateChange = vi.fn();
    render(
      <CustomUpdateDialog {...baseProps} onUpdateChange={onUpdateChange} updatedEntry={{ id: 1, unidentified: null }} />
    );
    expect(screen.getAllByRole('combobox')[0]).toHaveTextContent('Not Magical');
    openSelect(0);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Unidentified'));
    expect(onUpdateChange.mock.calls[0][0].target).toEqual({ name: 'unidentified', value: true });
  });

  it('reports null when Not Magical is picked on an item that was magical', () => {
    const onUpdateChange = vi.fn();
    render(
      <CustomUpdateDialog {...baseProps} onUpdateChange={onUpdateChange} updatedEntry={{ id: 1, unidentified: false }} />
    );
    openSelect(0);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Not Magical'));
    expect(onUpdateChange.mock.calls[0][0].target).toEqual({ name: 'unidentified', value: null });
  });

  it('labels the selects so the outline notch does not overlap the label', () => {
    render(<CustomUpdateDialog {...baseProps} />);
    for (const label of ['Magical?', 'Masterwork', 'Type', 'Size']) {
      expect(screen.getAllByText(label, { selector: 'legend span' }).length).toBeGreaterThan(0);
    }
  });
});

describe('CustomUpdateDialog wand charges (owner decision 2026-10-06)', () => {
  it('shows charges read-only with an explanation for a wand', () => {
    render(<CustomUpdateDialog {...baseProps} updatedEntry={{ id: 1, name: 'Wand of Magic Missile', charges: 12 }} />);
    const field = screen.getByLabelText('Charges');
    expect(field).toHaveValue(12);
    expect(field).toBeDisabled();
    expect(screen.getByText(/only through use/i)).toBeInTheDocument();
  });

  it('shows no charges field for items without charges', () => {
    render(<CustomUpdateDialog {...baseProps} updatedEntry={{ id: 1, name: 'Ring', charges: null }} />);
    expect(screen.queryByLabelText('Charges')).not.toBeInTheDocument();
  });
});
