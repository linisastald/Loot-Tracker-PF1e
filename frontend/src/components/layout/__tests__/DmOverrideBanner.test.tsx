import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

let campaignContextValue: any;
vi.mock('../../../contexts/CampaignContext', () => ({
  useCampaign: () => campaignContextValue,
}));

import DmOverrideBanner from '../DmOverrideBanner';

describe('DmOverrideBanner', () => {
  const setDmOverride = vi.fn();

  beforeEach(() => {
    setDmOverride.mockClear();
    campaignContextValue = { isSuperadmin: true, dmOverride: true, setDmOverride };
  });

  it('shows "Acting as DM!" with a button that turns the override off', () => {
    render(<DmOverrideBanner />);

    expect(screen.getByRole('status')).toHaveTextContent('Acting as DM!');
    fireEvent.click(screen.getByRole('button', { name: /turn off/i }));
    expect(setDmOverride).toHaveBeenCalledWith(false);
  });

  it('renders nothing while the override is off', () => {
    campaignContextValue = { ...campaignContextValue, dmOverride: false };
    const { container } = render(<DmOverrideBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a non-superadmin even with a stale flag', () => {
    campaignContextValue = { ...campaignContextValue, isSuperadmin: false };
    const { container } = render(<DmOverrideBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
