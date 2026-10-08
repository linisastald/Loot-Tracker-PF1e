/**
 * Unit tests for the superadmin campaign-administration handlers
 * (update / deactivate, members by campaign id, add member, change role,
 * remove member). Route-level gating is covered by routes/__tests__/campaigns.test.js.
 */

jest.mock('../../models/Campaign');
jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../services/scheduler/SessionSchedulerService', () => ({ restart: jest.fn() }));
jest.mock('../../services/discordBrokerService', () => ({ sendMessage: jest.fn() }));
jest.mock('../../utils/partyLevel', () => ({
  getActiveCharacterCount: jest.fn(), computeApl: jest.fn(), getPartyLevelInfo: jest.fn(),
}));

const Campaign = require('../../models/Campaign');
const campaignController = require('../campaignController');

const createMockRes = () => ({
  success: jest.fn(), created: jest.fn(), validationError: jest.fn(),
  notFound: jest.fn(), forbidden: jest.fn(), error: jest.fn(),
  json: jest.fn(), status: jest.fn().mockReturnThis(),
});

const createMockReq = (overrides = {}) => ({
  body: {}, params: {}, query: {},
  user: { id: 1, username: 'root' },
  campaignId: 1, campaignRole: 'DM', isSuperadmin: true,
  ...overrides,
});

const campaign = { id: 3, name: 'Curse', slug: 'curse', world: 'Golarion', is_active: true };

describe('campaignController admin handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Campaign.getById.mockResolvedValue(campaign);
  });

  describe('updateCampaign', () => {
    it('rejects a non-numeric campaign id', async () => {
      const res = createMockRes();
      await campaignController.updateCampaign(createMockReq({ params: { id: 'current' }, body: { name: 'X' } }), res);
      expect(res.validationError).toHaveBeenCalledWith('Campaign id must be a positive integer');
      expect(Campaign.getById).not.toHaveBeenCalled();
    });

    it('returns not found for a missing campaign', async () => {
      Campaign.getById.mockResolvedValue(null);
      const res = createMockRes();
      await campaignController.updateCampaign(createMockReq({ params: { id: '9' }, body: { name: 'X' } }), res);
      expect(res.notFound).toHaveBeenCalledWith('Campaign not found');
    });

    it('updates name and world, trimmed', async () => {
      Campaign.update.mockResolvedValue({ ...campaign, name: 'New', world: 'Eberron' });
      const res = createMockRes();
      await campaignController.updateCampaign(createMockReq({ params: { id: '3' }, body: { name: '  New ', world: ' Eberron ' } }), res);
      expect(Campaign.update).toHaveBeenCalledWith(3, { name: 'New', world: 'Eberron' });
      expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ name: 'New' }), 'Campaign updated successfully');
    });

    it('rejects an empty body', async () => {
      const res = createMockRes();
      await campaignController.updateCampaign(createMockReq({ params: { id: '3' }, body: {} }), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('Nothing to update'));
    });

    it('rejects a non-boolean is_active', async () => {
      const res = createMockRes();
      await campaignController.updateCampaign(createMockReq({ params: { id: '3' }, body: { is_active: 'no' } }), res);
      expect(res.validationError).toHaveBeenCalledWith('is_active must be true or false');
    });

    it('refuses to deactivate the last active campaign', async () => {
      Campaign.countActive.mockResolvedValue(1);
      const res = createMockRes();
      await campaignController.updateCampaign(createMockReq({ params: { id: '3' }, body: { is_active: false } }), res);
      expect(res.validationError).toHaveBeenCalledWith('The last active campaign cannot be deactivated');
      expect(Campaign.update).not.toHaveBeenCalled();
    });

    it('deactivates when another active campaign remains', async () => {
      Campaign.countActive.mockResolvedValue(2);
      Campaign.update.mockResolvedValue({ ...campaign, is_active: false });
      const res = createMockRes();
      await campaignController.updateCampaign(createMockReq({ params: { id: '3' }, body: { is_active: false } }), res);
      expect(Campaign.update).toHaveBeenCalledWith(3, { is_active: false });
      expect(res.success).toHaveBeenCalled();
    });

    it('reactivates without counting active campaigns', async () => {
      Campaign.getById.mockResolvedValue({ ...campaign, is_active: false });
      Campaign.update.mockResolvedValue(campaign);
      const res = createMockRes();
      await campaignController.updateCampaign(createMockReq({ params: { id: '3' }, body: { is_active: true } }), res);
      expect(Campaign.countActive).not.toHaveBeenCalled();
      expect(Campaign.update).toHaveBeenCalledWith(3, { is_active: true });
    });
  });

  describe('getCampaignMembers', () => {
    it('returns the roster with the campaign identity', async () => {
      const members = [{ user_id: 2, username: 'bob', role: 'Player' }];
      Campaign.getMembers.mockResolvedValue(members);
      const res = createMockRes();
      await campaignController.getCampaignMembers(createMockReq({ params: { id: '3' } }), res);
      expect(Campaign.getMembers).toHaveBeenCalledWith(3);
      expect(res.success).toHaveBeenCalledWith({ campaign: { id: 3, name: 'Curse' }, members }, 'Campaign members retrieved successfully');
    });
  });

  describe('addCampaignMember', () => {
    it('rejects an unknown role', async () => {
      const res = createMockRes();
      await campaignController.addCampaignMember(createMockReq({ params: { id: '3' }, body: { userId: 2, role: 'Owner' } }), res);
      expect(res.validationError).toHaveBeenCalledWith('role must be one of: DM, Player');
    });

    it('rejects a missing or deleted account', async () => {
      Campaign.findUserAccount.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 2, username: 'gone', role: 'deleted' });
      for (let i = 0; i < 2; i++) {
        const res = createMockRes();
        await campaignController.addCampaignMember(createMockReq({ params: { id: '3' }, body: { userId: 2, role: 'DM' } }), res);
        expect(res.notFound).toHaveBeenCalledWith('User not found');
      }
      expect(Campaign.addOrUpdateMember).not.toHaveBeenCalled();
    });

    it('adds a new member as DM', async () => {
      Campaign.findUserAccount.mockResolvedValue({ id: 2, username: 'alice', role: 'Player' });
      Campaign.getMembership.mockResolvedValue(null);
      Campaign.addOrUpdateMember.mockResolvedValue({ user_id: 2, campaign_id: 3, role: 'DM', joined_at: 't' });
      const res = createMockRes();
      await campaignController.addCampaignMember(createMockReq({ params: { id: '3' }, body: { userId: '2', role: 'DM' } }), res);
      expect(Campaign.addOrUpdateMember).toHaveBeenCalledWith(3, 2, 'DM');
      expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ role: 'DM', username: 'alice' }), 'Member added successfully');
    });

    it('refuses to demote the only DM through add', async () => {
      Campaign.findUserAccount.mockResolvedValue({ id: 2, username: 'alice', role: 'Player' });
      Campaign.getMembership.mockResolvedValue({ role: 'DM' });
      Campaign.countDMs.mockResolvedValue(1);
      const res = createMockRes();
      await campaignController.addCampaignMember(createMockReq({ params: { id: '3' }, body: { userId: 2, role: 'Player' } }), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('at least one DM'));
      expect(Campaign.addOrUpdateMember).not.toHaveBeenCalled();
    });
  });

  describe('updateCampaignMemberRole', () => {
    it('returns not found when the user is not a member', async () => {
      Campaign.getMembership.mockResolvedValue(null);
      const res = createMockRes();
      await campaignController.updateCampaignMemberRole(createMockReq({ params: { id: '3', userId: '2' }, body: { role: 'DM' } }), res);
      expect(res.notFound).toHaveBeenCalledWith('User is not a member of this campaign');
    });

    it('promotes a player to DM', async () => {
      Campaign.getMembership.mockResolvedValue({ role: 'Player' });
      Campaign.updateMemberRole.mockResolvedValue({ user_id: 2, campaign_id: 3, role: 'DM' });
      const res = createMockRes();
      await campaignController.updateCampaignMemberRole(createMockReq({ params: { id: '3', userId: '2' }, body: { role: 'DM' } }), res);
      expect(Campaign.countDMs).not.toHaveBeenCalled();
      expect(Campaign.updateMemberRole).toHaveBeenCalledWith(3, 2, 'DM');
      expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ role: 'DM' }), 'Member role updated successfully');
    });

    it('refuses to demote the last DM', async () => {
      Campaign.getMembership.mockResolvedValue({ role: 'DM' });
      Campaign.countDMs.mockResolvedValue(1);
      const res = createMockRes();
      await campaignController.updateCampaignMemberRole(createMockReq({ params: { id: '3', userId: '2' }, body: { role: 'Player' } }), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('at least one DM'));
      expect(Campaign.updateMemberRole).not.toHaveBeenCalled();
    });

    it('demotes a DM when another DM remains', async () => {
      Campaign.getMembership.mockResolvedValue({ role: 'DM' });
      Campaign.countDMs.mockResolvedValue(2);
      Campaign.updateMemberRole.mockResolvedValue({ user_id: 2, campaign_id: 3, role: 'Player' });
      const res = createMockRes();
      await campaignController.updateCampaignMemberRole(createMockReq({ params: { id: '3', userId: '2' }, body: { role: 'Player' } }), res);
      expect(Campaign.updateMemberRole).toHaveBeenCalledWith(3, 2, 'Player');
    });

    it('is a no-op when the role is unchanged', async () => {
      Campaign.getMembership.mockResolvedValue({ role: 'DM' });
      const res = createMockRes();
      await campaignController.updateCampaignMemberRole(createMockReq({ params: { id: '3', userId: '2' }, body: { role: 'DM' } }), res);
      expect(Campaign.updateMemberRole).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(expect.objectContaining({ role: 'DM' }), 'Member role unchanged');
    });
  });

  describe('createCampaign with a chosen DM', () => {
    const created = { id: 9, name: 'Curse', slug: 'curse', world: 'Golarion' };

    it('passes dmUserId to the model when another user is chosen', async () => {
      Campaign.findUserAccount.mockResolvedValue({ id: 4, username: 'gm', role: 'Player' });
      Campaign.create.mockResolvedValue(created);
      const res = createMockRes();
      await campaignController.createCampaign(createMockReq({ body: { name: 'Curse', dmUserId: '4' } }), res);
      expect(Campaign.create).toHaveBeenCalledWith(expect.objectContaining({ createdById: 1, dmUserId: 4 }));
      expect(res.created).toHaveBeenCalled();
    });

    it('omits dmUserId when the chosen DM is the creator', async () => {
      Campaign.findUserAccount.mockResolvedValue({ id: 1, username: 'root', role: 'DM' });
      Campaign.create.mockResolvedValue(created);
      await campaignController.createCampaign(createMockReq({ body: { name: 'Curse', dmUserId: 1 } }), createMockRes());
      expect(Campaign.create.mock.calls[0][0]).not.toHaveProperty('dmUserId');
    });

    it('rejects an unknown or deleted DM account', async () => {
      Campaign.findUserAccount.mockResolvedValue({ id: 4, username: 'x', role: 'deleted' });
      const res = createMockRes();
      await campaignController.createCampaign(createMockReq({ body: { name: 'Curse', dmUserId: 4 } }), res);
      expect(res.notFound).toHaveBeenCalledWith('DM user not found');
      expect(Campaign.create).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric dmUserId', async () => {
      const res = createMockRes();
      await campaignController.createCampaign(createMockReq({ body: { name: 'Curse', dmUserId: 'root' } }), res);
      expect(res.validationError).toHaveBeenCalledWith('dmUserId must be a positive integer');
    });
  });

  describe('removeCampaignMember', () => {
    it('removes a player', async () => {
      Campaign.getMembership.mockResolvedValue({ role: 'Player' });
      Campaign.removeMember.mockResolvedValue(true);
      const res = createMockRes();
      await campaignController.removeCampaignMember(createMockReq({ params: { id: '3', userId: '2' } }), res);
      expect(Campaign.removeMember).toHaveBeenCalledWith(3, 2);
      expect(res.success).toHaveBeenCalledWith(null, 'Member removed from campaign successfully');
    });

    it('refuses to remove the last DM', async () => {
      Campaign.getMembership.mockResolvedValue({ role: 'DM' });
      Campaign.countDMs.mockResolvedValue(1);
      const res = createMockRes();
      await campaignController.removeCampaignMember(createMockReq({ params: { id: '3', userId: '2' } }), res);
      expect(res.validationError).toHaveBeenCalledWith(expect.stringContaining('at least one DM'));
      expect(Campaign.removeMember).not.toHaveBeenCalled();
    });

    it('rejects a bad userId', async () => {
      const res = createMockRes();
      await campaignController.removeCampaignMember(createMockReq({ params: { id: '3', userId: 'me' } }), res);
      expect(res.validationError).toHaveBeenCalledWith('userId must be a positive integer');
    });
  });
});
