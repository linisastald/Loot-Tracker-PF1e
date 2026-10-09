import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import ShipDialog from '../ShipDialog';
import { NEW_SHIP_FORM, ShipForm } from '../ships/shipUtils';

const Harness: React.FC<{ initial?: Partial<ShipForm>; error?: string; onState?: (s: ShipForm) => void }> = ({
  initial = {}, error = '', onState
}) => {
  const [ship, setShip] = useState<ShipForm>({ ...NEW_SHIP_FORM, name: 'Wormwood', ...initial });
  onState?.(ship);
  return (
    <ShipDialog
      open
      onClose={vi.fn()}
      selectedShip={null}
      editingShip={ship}
      setEditingShip={setShip}
      shipTypes={[]}
      loadingShipTypes={false}
      onShipTypeChange={vi.fn()}
      onSave={vi.fn()}
      error={error}
    />
  );
};

describe('ShipDialog', () => {
  it('lets Max HP be cleared and retyped without snapping back to 100', async () => {
    const user = userEvent.setup();
    let latest: ShipForm = NEW_SHIP_FORM;
    render(<Harness onState={(s) => { latest = s; }} />);

    const maxHp = screen.getByLabelText('Max HP') as HTMLInputElement;
    await user.clear(maxHp);
    expect(maxHp.value).toBe('');
    await user.type(maxHp, '500');
    expect(maxHp.value).toBe('500');
    expect(latest.max_hp).toBe(500);
  });

  it('does not lower current HP while the Max HP digits are still being typed', async () => {
    const user = userEvent.setup();
    let latest: ShipForm = NEW_SHIP_FORM;
    render(<Harness initial={{ max_hp: 100, current_hp: 100 }} onState={(s) => { latest = s; }} />);

    const maxHp = screen.getByLabelText('Max HP');
    await user.clear(maxHp);
    await user.type(maxHp, '5');
    expect(latest.current_hp).toBe(100);
    await user.type(maxHp, '00');
    expect(latest.max_hp).toBe(500);
    expect(latest.current_hp).toBe(100);
  });

  it('accepts an AC of 0', async () => {
    const user = userEvent.setup();
    let latest: ShipForm = NEW_SHIP_FORM;
    render(<Harness onState={(s) => { latest = s; }} />);

    const baseAc = screen.getByLabelText('Base AC');
    await user.clear(baseAc);
    await user.type(baseAc, '0');
    expect((baseAc as HTMLInputElement).value).toBe('0');
    expect(latest.base_ac).toBe(0);
  });

  it('repairs an empty field to its default when it loses focus', async () => {
    const user = userEvent.setup();
    let latest: ShipForm = NEW_SHIP_FORM;
    render(<Harness onState={(s) => { latest = s; }} />);

    const touchAc = screen.getByLabelText('Touch AC') as HTMLInputElement;
    await user.clear(touchAc);
    await user.tab();
    expect(touchAc.value).toBe('10');
    expect(latest.touch_ac).toBe(10);
  });

  it('changes a weapon quantity without mutating the original weapon object', async () => {
    const user = userEvent.setup();
    const original = { type: 'Light Catapult', quantity: 1 };
    let latest: ShipForm = NEW_SHIP_FORM;
    render(<Harness initial={{ weapon_types: [original] }} onState={(s) => { latest = s; }} />);

    const quantity = screen.getByLabelText('Quantity');
    await user.clear(quantity);
    await user.type(quantity, '3');

    expect(latest.weapon_types?.[0].quantity).toBe(3);
    expect(original.quantity).toBe(1);
  });

  it('shows the error passed in', () => {
    render(<Harness error="Ship name is required" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Ship name is required');
  });

  it('offers every ship status', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('combobox', { name: /ship status/i }));
    ['PC Active', 'Active', 'Docked', 'Lost', 'Sunk'].forEach((status) => {
      expect(screen.getByRole('option', { name: status })).toBeInTheDocument();
    });
  });

  describe('captain, flag and notes', () => {
    it('shows inputs for all three, filled from the ship being edited', () => {
      render(<Harness initial={{ captain_name: 'Cap Kettle', flag_description: 'A red skull', ship_notes: 'Leaks a bit' }} />);
      expect(screen.getByLabelText('Captain')).toHaveValue('Cap Kettle');
      expect(screen.getByLabelText('Flag')).toHaveValue('A red skull');
      expect(screen.getByLabelText('Ship Notes')).toHaveValue('Leaks a bit');
    });

    it('writes what is typed into the ship form', async () => {
      const user = userEvent.setup();
      let latest: ShipForm = NEW_SHIP_FORM;
      render(<Harness onState={(s) => { latest = s; }} />);
      await user.type(screen.getByLabelText('Captain'), 'Cap');
      await user.type(screen.getByLabelText('Flag'), 'Skull');
      await user.type(screen.getByLabelText('Ship Notes'), 'Fast');
      expect(latest.captain_name).toBe('Cap');
      expect(latest.flag_description).toBe('Skull');
      expect(latest.ship_notes).toBe('Fast');
    });

    it('limits the captain to the 255 characters the database stores', () => {
      render(<Harness />);
      expect(screen.getByLabelText('Captain')).toHaveAttribute('maxlength', '255');
    });
  });
});
