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
    beforeEach(() => {
      // Default: no per-campaign settings stored
      Campaign.getSettingsMap.mockResolvedValue({});
    });

    it('should return the current campaign context with the campaign row and settings map', async () => {
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
      expect(Campaign.getSettingsMap).toHaveBeenCalledWith(2);
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
          settings: {},
        },
        'Current campaign retrieved successfully'
      );
    });

    it('should include the parsed per-campaign settings map (theme override etc.)', async () => {
      const req = createMockReq({ campaignId: 2, campaignRole: 'Player' });
      const res = createMockRes();

      Campaign.getById.mockResolvedValue({
        id: 2, name: 'Skulls & Shackles', slug: 'sns', world: 'Golarion', is_active: true,
      });
      // 'json'-typed rows arrive parsed from the model
      Campaign.getSettingsMap.mockResolvedValue({
        theme: { mode: 'dark', primary: '#336699' },
      });

      await campaignController.getCurrentCampaign(req, res);

      expect(res.success).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: { theme: { mode: 'dark', primary: '#336699' } },
        }),
        expect.any(String)
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

    it('should return null campaign fields and empty settings when no campaign context is set', async () => {
      const req = createMockReq({ campaignId: undefined, campaignRole: undefined, isSuperadmin: undefined });
      const res = createMockRes();

      await campaignController.getCurrentCampaign(req, res);

      expect(Campaign.getById).not.toHaveBeenCalled();
      expect(Campaign.getSettingsMap).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        {
          campaignId: null,
          role: null,
          isSuperadmin: false,
          campaign: null,
          settings: {},
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
  // updateCurrentCampaignSetting (PUT /campaigns/current/settings)
  // -------------------------------------------------------------------
  describe('updateCurrentCampaignSetting', () => {
    function createDmReq(body) {
      return createMockReq({ campaignId: 2, campaignRole: 'DM', body });
    }

    it('should reject a setting name outside the whitelist', async () => {
      const req = createDmReq({ name: 'discord_webhook', value: 'https://example.com' });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        expect.stringContaining("'discord_webhook' is not a configurable campaign setting")
      );
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
      expect(Campaign.deleteSetting).not.toHaveBeenCalled();
    });

    it('should reject a missing name', async () => {
      const req = createDmReq({ value: { mode: 'dark' } });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith("Field 'name' is required");
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it('should upsert a valid theme as a JSON string with value_type json', async () => {
      const theme = { mode: 'dark', primary: '#336699', secondary: '#AB12CD' };
      const req = createDmReq({ name: 'theme', value: theme });
      const res = createMockRes();

      Campaign.upsertSetting.mockResolvedValue({
        name: 'theme', value: JSON.stringify(theme), value_type: 'json',
      });

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(Campaign.upsertSetting).toHaveBeenCalledWith(2, 'theme', JSON.stringify(theme), 'json');
      expect(res.success).toHaveBeenCalledWith(
        { name: 'theme', value: theme },
        'Campaign setting updated successfully'
      );
    });

    it('should accept a partial theme (single key)', async () => {
      const req = createDmReq({ name: 'theme', value: { primary: '#001122' } });
      const res = createMockRes();

      Campaign.upsertSetting.mockResolvedValue({ name: 'theme' });

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(Campaign.upsertSetting).toHaveBeenCalledWith(
        2, 'theme', JSON.stringify({ primary: '#001122' }), 'json'
      );
      expect(res.success).toHaveBeenCalledWith(
        { name: 'theme', value: { primary: '#001122' } },
        'Campaign setting updated successfully'
      );
    });

    it('should accept a theme provided as a JSON string', async () => {
      const req = createDmReq({ name: 'theme', value: '{"mode":"light"}' });
      const res = createMockRes();

      Campaign.upsertSetting.mockResolvedValue({ name: 'theme' });

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(Campaign.upsertSetting).toHaveBeenCalledWith(
        2, 'theme', JSON.stringify({ mode: 'light' }), 'json'
      );
      expect(res.success).toHaveBeenCalledWith(
        { name: 'theme', value: { mode: 'light' } },
        expect.any(String)
      );
    });

    it('should reject an invalid theme mode', async () => {
      const req = createDmReq({ name: 'theme', value: { mode: 'blue' } });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith("theme.mode must be 'dark' or 'light'");
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it.each([
      ['too short', '#12345'],
      ['too long', '#1234567'],
      ['named color', 'red'],
      ['missing hash', '336699'],
      ['non-hex digits', '#33669g'],
      ['non-string', 336699],
    ])('should reject an invalid primary color (%s)', async (_label, primary) => {
      const req = createDmReq({ name: 'theme', value: { primary } });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'theme.primary must be a hex color in #rrggbb format'
      );
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it('should reject an invalid secondary color', async () => {
      const req = createDmReq({ name: 'theme', value: { mode: 'dark', secondary: '#xyzxyz' } });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'theme.secondary must be a hex color in #rrggbb format'
      );
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it('should reject a theme with unknown keys', async () => {
      const req = createDmReq({ name: 'theme', value: { mode: 'dark', tertiary: '#336699' } });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'theme may only contain the keys: mode, primary, secondary'
      );
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it.each([
      ['array', ['dark']],
      ['number', 7],
      ['boolean', true],
      ['JSON string of a non-object', '"dark"'],
      ['unparseable string', '{mode: dark}'],
    ])('should reject a non-object theme value (%s)', async (_label, value) => {
      const req = createDmReq({ name: 'theme', value });
      const res = createMockRes();

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.validationError).toHaveBeenCalledWith(
        'theme must be an object (or a JSON string encoding one)'
      );
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
    });

    it.each([
      ['null', null],
      ['empty object', {}],
      ['empty string', ''],
      ['JSON empty object string', '{}'],
    ])('should clear the override (DELETE the row) when value is %s', async (_label, value) => {
      const req = createDmReq({ name: 'theme', value });
      const res = createMockRes();

      Campaign.deleteSetting.mockResolvedValue(true);

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(Campaign.deleteSetting).toHaveBeenCalledWith(2, 'theme');
      expect(Campaign.upsertSetting).not.toHaveBeenCalled();
      expect(res.success).toHaveBeenCalledWith(
        { name: 'theme', value: null },
        'Campaign setting cleared successfully'
      );
    });

    it('should clear the override when value is absent from the body', async () => {
      const req = createDmReq({ name: 'theme' });
      const res = createMockRes();

      Campaign.deleteSetting.mockResolvedValue(false);

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(Campaign.deleteSetting).toHaveBeenCalledWith(2, 'theme');
      expect(res.success).toHaveBeenCalledWith(
        { name: 'theme', value: null },
        'Campaign setting cleared successfully'
      );
    });

    it('should surface model errors as server errors', async () => {
      const req = createDmReq({ name: 'theme', value: { mode: 'dark' } });
      const res = createMockRes();

      Campaign.upsertSetting.mockRejectedValue(new Error('connection refused'));

      await campaignController.updateCurrentCampaignSetting(req, res);

      expect(res.error).toHaveBeenCalledWith('Internal server error');
    });

    // The DM gate lives at the route layer (checkRole('DM')); verify the
    // middleware behavior with the per-campaign role the route relies on.
    describe('route guard: checkRole(DM)', () => {
      const checkRole = require('../../middleware/checkRole');

      it('should 403 a per-campaign Player', () => {
        const req = createMockReq({ campaignRole: 'Player' });
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        checkRole('DM')(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ message: 'Access denied: Insufficient permissions' });
        expect(next).not.toHaveBeenCalled();
      });

      it('should pass a per-campaign DM through', () => {
        const req = createMockReq({ campaignRole: 'DM' });
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        checkRole('DM')(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });
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
