import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import React from 'react';

vi.mock('../../../../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import api from '../../../../utils/api';
import CampaignAdministration from '../CampaignAdministration';

class MockResizeObserver { observe() {} unobserve() {} disconnect() {} }
(global as any).ResizeObserver = MockResizeObserver;

const campaigns = [
  { id: 1, name: 'Rise of the Runelords', slug: 'rotrl', world: 'Golarion', is_active: true },
  { id: 2, name: 'Skulls & Shackles', slug: 'sns', world: 'Golarion', is_active: false },
];
const users = [
  { id: 1, username: 'root', role: 'DM' },
  { id: 2, username: 'alice', role: 'Player' },
  { id: 3, username: 'bob', role: 'Player' },
  { id: 4, username: 'gone', role: 'deleted' },
];
const members = [
  { user_id: 1, username: 'root', role: 'DM' },
  { user_id: 2, username: 'alice', role: 'Player' },
];

const renderIt = (onChanged = vi.fn()) => {
  render(
    <SnackbarProvider>
      <CampaignAdministration campaigns={campaigns} users={users} currentUserId={1} onCampaignsChanged={onChanged} />
    </SnackbarProvider>
  );
  return onChanged;
};

const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

describe('CampaignAdministration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (global as any).ResizeObserver = MockResizeObserver;
    (api.get as any).mockResolvedValue({ success: true, data: { campaign: { id: 1, name: 'Rise of the Runelords' }, members } });
    (api.post as any).mockResolvedValue({ success: true, data: {} });
    (api.put as any).mockResolvedValue({ success: true, data: {} });
    (api.delete as any).mockResolvedValue({ success: true });
  });

  it('lists campaigns with their active state and actions', () => {
    renderIt();
    expect(within(row('Rise of the Runelords')).getByText('Active')).toBeInTheDocument();
    expect(within(row('Skulls & Shackles')).getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate Skulls & Shackles' })).toBeInTheDocument();
  });

  it('disables deactivation of the last active campaign', () => {
    renderIt();
    expect(screen.getByRole('button', { name: 'Deactivate Rise of the Runelords' })).toBeDisabled();
  });

  it('creates a campaign and refreshes the list', async () => {
    const onChanged = renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Campaign name/), { target: { value: '  Curse of the Crimson Throne ' } });
    fireEvent.change(within(dialog).getByLabelText(/World/), { target: { value: 'Golarion' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/campaigns', { name: 'Curse of the Crimson Throne', world: 'Golarion', dmUserId: 1 }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('defaults the DM to the logged-in superadmin and lets another user be chosen', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('DM')).toHaveTextContent('root (you)');

    fireEvent.mouseDown(within(dialog).getByLabelText('DM'));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).queryByText('gone')).toBeNull();
    fireEvent.click(within(listbox).getByText('bob'));
    fireEvent.change(within(dialog).getByLabelText(/Campaign name/), { target: { value: 'Giantslayer' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/campaigns', expect.objectContaining({ name: 'Giantslayer', dmUserId: 3 })));
  });

  it('edits name and world through PUT /campaigns/:id', async () => {
    const onChanged = renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Rise of the Runelords' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Campaign name/), { target: { value: 'RotRL Anniversary' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/campaigns/1', { name: 'RotRL Anniversary', world: 'Golarion' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('shows the server message when the save fails', async () => {
    (api.put as any).mockRejectedValue({ response: { data: { message: 'Campaign name cannot exceed 255 characters' } } });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Rise of the Runelords' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Campaign name cannot exceed 255 characters')).toBeInTheDocument();
  });

  it('reactivates an inactive campaign after confirmation', async () => {
    const onChanged = renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate Skulls & Shackles' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reactivate' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/campaigns/2', { is_active: true }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  describe('members dialog', () => {
    it('loads the roster, offers only non-member live accounts to add, and adds as the chosen role', async () => {
      renderIt();
      fireEvent.click(screen.getByRole('button', { name: 'Members of Rise of the Runelords' }));
      const dialog = await screen.findByRole('dialog');
      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/campaigns/1/members'));
      expect(await within(dialog).findByText('alice')).toBeInTheDocument();

      fireEvent.mouseDown(within(dialog).getByLabelText('Add user'));
      const listbox = await screen.findByRole('listbox');
      expect(within(listbox).queryByText('alice')).toBeNull();
      expect(within(listbox).queryByText('gone')).toBeNull();
      fireEvent.click(within(listbox).getByText('bob'));

      fireEvent.mouseDown(within(dialog).getByLabelText('As'));
      fireEvent.click(within(await screen.findByRole('listbox')).getByText('DM'));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/campaigns/1/members', { userId: 3, role: 'DM' }));
      await waitFor(() => expect((api.get as any).mock.calls.filter((c: any[]) => c[0] === '/campaigns/1/members')).toHaveLength(2));
    });

    it('changes a member role and removes a member', async () => {
      renderIt();
      fireEvent.click(screen.getByRole('button', { name: 'Members of Rise of the Runelords' }));
      const dialog = await screen.findByRole('dialog');
      await within(dialog).findByText('alice');

      fireEvent.mouseDown(within(dialog).getByLabelText('Role of alice'));
      fireEvent.click(within(await screen.findByRole('listbox')).getByText('DM'));
      await waitFor(() => expect(api.put).toHaveBeenCalledWith('/campaigns/1/members/2', { role: 'DM' }));

      const aliceRow = within(dialog).getByText('alice').closest('tr') as HTMLElement;
      fireEvent.click(within(aliceRow).getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/campaigns/1/members/2'));
    });

    it('surfaces the last-DM refusal from the server', async () => {
      (api.delete as any).mockRejectedValue({ response: { data: { message: 'A campaign must keep at least one DM; assign another DM first' } } });
      renderIt();
      fireEvent.click(screen.getByRole('button', { name: 'Members of Rise of the Runelords' }));
      const dialog = await screen.findByRole('dialog');
      const rootRow = (await within(dialog).findByText('root')).closest('tr') as HTMLElement;
      fireEvent.click(within(rootRow).getByRole('button', { name: 'Remove' }));
      expect(await within(dialog).findByText(/at least one DM/)).toBeInTheDocument();
    });
  });
});
