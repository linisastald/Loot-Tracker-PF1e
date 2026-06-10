/**
 * Unit tests for campaignController
 * Tests campaign listing (member vs superadmin), current-campaign context,
 * and campaign creation (superadmin gate, slug derivation, duplicate slug,
 * name validation).
 */

jest.mock('../../models/Campaign');
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const Campaign = require('../../models/Campaign');
const campaignController = require('../campaignController');

function createMockRes() {
  return {
    success: jest.fn(),
    created: jest.fn(),
    validationError: jest.fn(),
    notFound: jest.fn(),
    forbidden: jest.fn(),
    error: jest.fn(),
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
}

function createMockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 1, username: 'tester' },
    campaignId: 1,
    campaignRole: 'Player',
    isSuperadmin: false,
    ...overrides,
  };
}

describe('campaignController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // getMyCampaigns
  // -------------------------------------------------------------------
  describe('getMyCampaigns', () => {
    it('should return the member campaigns with per-campaign roles for a regular user', async () => {
      const memberships = [
        { id: 1, name: 'Rise of the Runelords', slug: 'rotr', world: 'Golarion', is_active: true, role: 'Player' },
        { id: 2, name: 'Skulls & Shackles', slug: 'sns', world: 'Golarion', is_active: true, role: 'DM' },
      ];
      const req = createMockReq();
      const res = createMockRes();

      Campaign.getForUser.mockResolvedValue(memberships);

      await campaignController.getMyCampaigns(req, res);

      expect(Campaign.getForUser).toHaveBeenCalledWith(1);
      expect(Campaign.getAll).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(memberships, 'Campaigns retrieved successfully');
    });

    it('should return all campaigns annotated role DM for a superadmin', async () => {
      const allCampaigns = [
        { id: 1, name: 'Rise of the Runelords', slug: 'rotr', world: 'Golarion', is_active: true },
        { id: 2, name: 'Skulls & Shackles', slug: 'sns', world: 'Golarion', is_active: false },
      ];
      const req = createMockReq({ isSuperadmin: true });
      const res = createMockRes();

      Campaign.getAll.mockResolvedValue(allCampaigns);

      await campaignController.getMyCampaigns(req, res);

      expect(Campaign.getAll).toHaveBeenCalled();
      expect(Campaign.getForUser).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        [
          expect.objectContaining({ id: 1, slug: 'rotr', role: 'DM' }),
          expect.objectContaining({ id: 2, slug: 'sns', role: 'DM' }),
        ],
        'Campaigns retrieved successfully'
      );
    });

    it('should return an empty list for a user with no memberships', async () => {
      const req = createMockReq();
      const res = createMockRes();

      Campaign.getForUser.mockResolvedValue([]);

      await campaignController.getMyCampaigns(req, res);

      expect(res.success).toHaveBeenCalledWith([], 'Campaigns retrieved successfully');
    });
  });

  // -------------------------------------------------------------------
  // getCurrentCampaign
  // -------------------------------------------------------------------
  describe('getCurrentCampaign', () => {
    it('should return the current campaign context with the campaign row', async () => {
      const req = createMockReq({ campaignId: 2, campaignRole: 'DM', isSuperadmin: false });
      const res = createMockRes();

      Campaign.getById.mockResolvedValue({
        id: 2,
        name: 'Skulls & Shackles',
        slug: 'sns',
        world: 'Golarion',
        is_active: true,
      });

      await campaignController.getCurrentCampaign(req, res);

      expect(Campaign.getById).toHaveBeenCalledWith(2);
      expect(res.success).toHaveBeenCalledWith(
        {
          campaignId: 2,
          role: 'DM',
          isSuperadmin: false,
          campaign: {
            id: 2,
            name: 'Skulls & Shackles',
            slug: 'sns',
            world: 'Golarion',
            is_active: true,
          },
        },
        'Current campaign retrieved successfully'
      );
    });

    it('should report isSuperadmin true for superadmins', async () => {
      const req = createMockReq({ campaignId: 1, campaignRole: 'DM', isSuperadmin: true });
      const res = createMockRes();

      Campaign.getById.mockResolvedValue({
        id: 1, name: 'Default', slug: 'default', world: 'Golarion', is_active: true,
      });

      await campaignController.getCurrentCampaign(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ isSuperadmin: true }),
        expect.any(String)
      );
    });

    it('should return null campaign fields when no campaign context is set', async () => {
      const req = createMockReq({ campaignId: undefined, campaignRole: undefined, isSuperadmin: undefined });
      const res = createMockRes();

      await campaignController.getCurrentCampaign(req, res);

      expect(Campaign.getById).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        {
          campaignId: null,
          role: null,
          isSuperadmin: false,
          campaign: null,
        },
        expect.any(String)
      );
    });

    it('should return campaign null when the campaign row no longer exists', async () => {
      const req = createMockReq({ campaignId: 99, campaignRole: 'Player' });
      const res = createMockRes();

      Campaign.getById.mockResolvedValue(null);

      await campaignController.getCurrentCampaign(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({ campaignId: 99, campaign: null }),
        expect.any(String)
      );
    });
  });

  // -------------------------------------------------------------------
  // createCampaign
  // -------------------------------------------------------------------
  describe('createCampaign', () => {
    const createdCampaign = {
      id: 3,
      name: 'New Campaign',
      slug: 'new-campaign',
      world: 'Golarion',
      is_active: true,
      created_by: 1,
    };

    it('should create a campaign for a superadmin with an explicit slug', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'New Campaign', slug: 'my-slug', world: 'Golarion' },
      });
      const res = createMockRes();

      Campaign.create.mockResolvedValue({ ...createdCampaign, slug: 'my-slug' });

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).toHaveBeenCalledWith({
        name: 'New Campaign',
        slug: 'my-slug',
        world: 'Golarion',
        createdById: 1,
      });
      expect(res.created).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'my-slug' }),
        'Campaign created successfully'
      );
    });

    it('should reject non-superadmins with 403, even campaign DMs', async () => {
      const req = createMockReq({
        isSuperadmin: false,
        campaignRole: 'DM',
        body: { name: 'New Campaign' },
      });
      const res = createMockRes();

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).not.toHaveBeenCalled();
      expect(res.forbidden).toHaveBeenCalledWith('Only superadmins can create campaigns');
    });

    it('should derive the slug from the name when no slug is given', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: "Carrion Crown: The DM's  Cut!" },
      });
      const res = createMockRes();

      Campaign.create.mockResolvedValue(createdCampaign);

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'carrion-crown-the-dms-cut' })
      );
    });

    it('should normalize a provided slug (lowercase, strip invalid characters)', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'Whatever', slug: '  My Slug__#1  ' },
      });
      const res = createMockRes();

      Campaign.create.mockResolvedValue(createdCampaign);

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'my-slug1' })
      );
    });

    it('should default world to Golarion when not provided', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'Worldless' },
      });
      const res = createMockRes();

      Campaign.create.mockResolvedValue(createdCampaign);

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({ world: 'Golarion' })
      );
    });

    it('should reject a missing name', async () => {
      const req = createMockReq({ isSuperadmin: true, body: {} });
      const res = createMockRes();

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).not.toHaveBeenCalled();
      expect(res.validationError).toHaveBeenCalledWith('Campaign name is required');
    });

    it('should reject a whitespace-only name', async () => {
      const req = createMockReq({ isSuperadmin: true, body: { name: '   ' } });
      const res = createMockRes();

      await campaignController.createCampaign(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Campaign name is required');
    });

    it('should reject a name longer than 255 characters', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'x'.repeat(256) },
      });
      const res = createMockRes();

      await campaignController.createCampaign(req, res);

      expect(res.validationError).toHaveBeenCalledWith('Campaign name cannot exceed 255 characters');
    });

    it('should reject when the slug is empty after stripping invalid characters', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'Valid Name', slug: '!!!###' },
      });
      const res = createMockRes();

      await campaignController.createCampaign(req, res);

      expect(Campaign.create).not.toHaveBeenCalled();
      expect(res.validationError).toHaveBeenCalledWith(
        'Campaign slug must contain at least one letter or number'
      );
    });

    it('should translate a duplicate-slug UNIQUE violation into a validation error', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'Duplicate', slug: 'taken' },
      });
      const res = createMockRes();

      const uniqueViolation = new Error('duplicate key value violates unique constraint "campaigns_slug_key"');
      uniqueViolation.code = '23505';
      Campaign.create.mockRejectedValue(uniqueViolation);

      await campaignController.createCampaign(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        "A campaign with the slug 'taken' already exists"
      );
    });

    it('should surface unexpected model errors as server errors', async () => {
      const req = createMockReq({
        isSuperadmin: true,
        body: { name: 'Boom' },
      });
      const res = createMockRes();

      Campaign.create.mockRejectedValue(new Error('connection refused'));

      await campaignController.createCampaign(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });
  });
});
