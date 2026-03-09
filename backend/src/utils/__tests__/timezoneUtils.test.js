jest.mock('../dbUtils', () => ({
  executeQuery: jest.fn(),
}));

jest.mock('../logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const { isValidTimezone, getTimezoneOptions, clearTimezoneCache, getCampaignTimezone, VALID_TIMEZONES } = require('../timezoneUtils');
const dbUtils = require('../dbUtils');

describe('timezoneUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearTimezoneCache();
  });

  describe('VALID_TIMEZONES', () => {
    it('should include common US timezones', () => {
      expect(VALID_TIMEZONES).toContain('America/New_York');
      expect(VALID_TIMEZONES).toContain('America/Chicago');
      expect(VALID_TIMEZONES).toContain('America/Denver');
      expect(VALID_TIMEZONES).toContain('America/Los_Angeles');
    });

    it('should include UTC', () => {
      expect(VALID_TIMEZONES).toContain('UTC');
    });
  });

  describe('isValidTimezone', () => {
    it('should accept whitelisted timezones', () => {
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
    });

    it('should accept valid IANA timezones not in whitelist', () => {
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('Asia/Tokyo')).toBe(true);
    });

    it('should reject invalid timezones', () => {
      expect(isValidTimezone('Not/A/Timezone')).toBe(false);
      expect(isValidTimezone('Invalid')).toBe(false);
    });

    it('should reject null/undefined/non-string', () => {
      expect(isValidTimezone(null)).toBe(false);
      expect(isValidTimezone(undefined)).toBe(false);
      expect(isValidTimezone(123)).toBe(false);
      expect(isValidTimezone('')).toBe(false);
    });
  });

  describe('getTimezoneOptions', () => {
    it('should return array of timezone options', () => {
      const options = getTimezoneOptions();
      expect(options.length).toBeGreaterThan(0);
      expect(options[0]).toHaveProperty('value');
      expect(options[0]).toHaveProperty('label');
    });

    it('should include Eastern Time', () => {
      const options = getTimezoneOptions();
      const eastern = options.find(o => o.value === 'America/New_York');
      expect(eastern).toBeDefined();
      expect(eastern.label).toContain('Eastern');
    });
  });

  describe('getCampaignTimezone', () => {
    it('should return timezone from database', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ value: 'America/Chicago' }],
      });

      const result = await getCampaignTimezone();

      expect(result).toBe('America/Chicago');
    });

    it('should return default when no setting found', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });

      const result = await getCampaignTimezone();

      expect(result).toBe('America/New_York');
    });

    it('should return default for invalid timezone in DB', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ value: 'Invalid/Timezone' }],
      });

      const result = await getCampaignTimezone();

      expect(result).toBe('America/New_York');
    });

    it('should cache the result', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ value: 'America/Denver' }],
      });

      await getCampaignTimezone();
      await getCampaignTimezone();

      // Should only query DB once
      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(1);
    });

    it('should return default on DB error', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('DB down'));

      const result = await getCampaignTimezone();

      expect(result).toBe('America/New_York');
    });
  });

  describe('clearTimezoneCache', () => {
    it('should force re-fetch on next call', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ value: 'America/Denver' }],
      });

      await getCampaignTimezone();
      clearTimezoneCache();
      await getCampaignTimezone();

      expect(dbUtils.executeQuery).toHaveBeenCalledTimes(2);
    });
  });
});
