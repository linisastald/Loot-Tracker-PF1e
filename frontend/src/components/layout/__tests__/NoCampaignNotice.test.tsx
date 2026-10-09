import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('../../../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const switchCampaignMock = vi.fn();
vi.mock('../../../contexts/CampaignContext', () => ({
  useCampaign: () => ({ switchCampaign: switchCampaignMock }),
}));

import api from '../../../utils/api';
import NoCampaignNotice from '../NoCampaignNotice';

describe('NoCampaignNotice', () => {
  const onLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explains the user is not in a campaign and offers an invite code field', () => {
    render(<NoCampaignNotice onLogout={onLogout} />);
    expect(screen.getByText(/you are not in a campaign/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument();
  });

  it('redeems a valid code and switches to the joined campaign', async () => {
    (api.post as any).mockResolvedValue({ success: true, data: { campaign: { id: 4, name: 'X', slug: 'x' }, role: 'Player' } });
    render(<NoCampaignNotice onLogout={onLogout} />);

    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: /join campaign/i }));

    await waitFor(() => expect(switchCampaignMock).toHaveBeenCalledWith(4));
    expect(api.post).toHaveBeenCalledWith('/invites/redeem', { code: 'ABCD1234' });
  });

  it('shows the server error for a bad code and does not switch campaign', async () => {
    (api.post as any).mockRejectedValue({ response: { data: { message: 'Invalid or used invite code' } } });
    render(<NoCampaignNotice onLogout={onLogout} />);

    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: 'ABCD1234' } });
    fireEvent.click(screen.getByRole('button', { name: /join campaign/i }));

    expect(await screen.findByText('Invalid or used invite code')).toBeInTheDocument();
    expect(switchCampaignMock).not.toHaveBeenCalled();
  });

  it.each(['ab', 'abcdef', 'abcdefg'])('rejects the code %s without calling the API', (code) => {
    render(<NoCampaignNotice onLogout={onLogout} />);
    fireEvent.change(screen.getByLabelText(/invite code/i), { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: /join campaign/i }));
    expect(screen.getByText(/exactly 8 letters and numbers/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('lets the user log out', () => {
    render(<NoCampaignNotice onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(onLogout).toHaveBeenCalled();
  });
});
