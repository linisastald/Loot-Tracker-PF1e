import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
