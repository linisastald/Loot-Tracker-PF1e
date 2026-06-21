import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('../../services/lootService', () => ({
  default: {},
}));

import api from '../api';
import { prepareEntryForSubmission } from '../lootEntryUtils';

const goldEntry = (overrides = {}) => ({
  type: 'gold',
  data: {
    sessionDate: '2025-01-15',
    transactionType: 'Withdrawal',
    platinum: '',
    gold: '10',
    silver: '',
    copper: '',
    notes: 'test',
    characterId: '',
    ...overrides,
  },
});

describe('prepareEntryForSubmission (gold attribution)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the DM-selected character_id as an integer', async () => {
    await prepareEntryForSubmission(goldEntry({ characterId: '42' }));

    expect(api.post).toHaveBeenCalledWith('/gold', {
      goldEntries: [expect.objectContaining({ character_id: 42 })],
    });
    // The frontend-only characterId field must not be forwarded
    const sent = api.post.mock.calls[0][1].goldEntries[0];
    expect(sent.characterId).toBeUndefined();
  });

  it('sends null character_id when none is selected (unattributed)', async () => {
    await prepareEntryForSubmission(goldEntry({ characterId: '' }));

    const sent = api.post.mock.calls[0][1].goldEntries[0];
    expect(sent.character_id).toBeNull();
  });

  it('does not fall back to the passed activeCharacterId', async () => {
    // Even if an activeCharacterId is provided, "None" stays unattributed;
    // the server forces the active character for players on its own.
    await prepareEntryForSubmission(goldEntry({ characterId: '' }), 99);

    const sent = api.post.mock.calls[0][1].goldEntries[0];
    expect(sent.character_id).toBeNull();
  });
});
