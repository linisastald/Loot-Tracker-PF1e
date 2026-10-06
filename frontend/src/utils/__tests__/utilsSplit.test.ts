import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/lootService', () => ({
  default: { splitStack: vi.fn() },
}));
vi.mock('../api', () => ({ default: {} }));

import lootService from '../../services/lootService';
import { handleSplitSubmit } from '../utils';

const splitStack = lootService.splitStack as unknown as ReturnType<typeof vi.fn>;

describe('handleSplitSubmit', () => {
  const fetchLoot = vi.fn();
  const setOpenSplitDialog = vi.fn();
  const setSelectedItems = vi.fn();
  const quantities = [{ quantity: 2 }, { quantity: 3 }] as never;

  const run = () =>
    handleSplitSubmit(quantities, [7], 5, fetchLoot, setOpenSplitDialog, setSelectedItems);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('refreshes, closes the dialog and clears the selection when the interceptor returns the body', async () => {
    // The api interceptor returns response.data: { success, message, data } - no status field
    splitStack.mockResolvedValue({ success: true, message: 'Item split successfully', data: {} });

    await run();

    expect(fetchLoot).toHaveBeenCalledTimes(1);
    expect(setOpenSplitDialog).toHaveBeenCalledWith(false);
    expect(setSelectedItems).toHaveBeenCalledWith([]);
  });

  it('does not refresh or close when the body reports success: false', async () => {
    splitStack.mockResolvedValue({ success: false, message: 'nope' });

    await run();

    expect(fetchLoot).not.toHaveBeenCalled();
    expect(setOpenSplitDialog).not.toHaveBeenCalled();
  });

  it('does not refresh or close when the request rejects', async () => {
    splitStack.mockRejectedValue(new Error('500'));

    await run();

    expect(fetchLoot).not.toHaveBeenCalled();
    expect(setOpenSplitDialog).not.toHaveBeenCalled();
  });
});
