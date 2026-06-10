const campaignContext = require('../campaignContext');

describe('campaignContext', () => {
  describe('getCampaignId', () => {
    it('defaults to "1" when no context is active', () => {
      expect(campaignContext.getCampaignId()).toBe('1');
    });
  });

  describe('runWithCampaign', () => {
    it('exposes the campaign id inside the context', () => {
      campaignContext.runWithCampaign('7', () => {
        expect(campaignContext.getCampaignId()).toBe('7');
      });
    });

    it('coerces numeric campaign ids to strings', () => {
      campaignContext.runWithCampaign(42, () => {
        expect(campaignContext.getCampaignId()).toBe('42');
      });
    });

    it('supports the cross-campaign sentinel "all"', () => {
      campaignContext.runWithCampaign('all', () => {
        expect(campaignContext.getCampaignId()).toBe('all');
      });
    });

    it('returns the value returned by the callback', () => {
      const result = campaignContext.runWithCampaign('3', () => 'done');
      expect(result).toBe('done');
    });

    it('restores the default after the context exits', () => {
      campaignContext.runWithCampaign('9', () => {});
      expect(campaignContext.getCampaignId()).toBe('1');
    });

    it('supports nested contexts and restores the outer value', () => {
      campaignContext.runWithCampaign('2', () => {
        expect(campaignContext.getCampaignId()).toBe('2');

        campaignContext.runWithCampaign('3', () => {
          expect(campaignContext.getCampaignId()).toBe('3');
        });

        expect(campaignContext.getCampaignId()).toBe('2');
      });
    });

    it('propagates the context across async continuations', async () => {
      await campaignContext.runWithCampaign('5', async () => {
        await new Promise((resolve) => setImmediate(resolve));
        expect(campaignContext.getCampaignId()).toBe('5');
      });
      expect(campaignContext.getCampaignId()).toBe('1');
    });
  });

  describe('runWithCampaign validation', () => {
    it.each([
      'abc',
      '1; DROP TABLE loot',
      '-1',
      '1.5',
      '1 ',
      '',
      'ALL',
      'all2',
    ])('throws on invalid campaign id %j', (badId) => {
      const fn = jest.fn();
      expect(() => campaignContext.runWithCampaign(badId, fn)).toThrow(
        `Invalid campaign id: ${String(badId)}`
      );
      expect(fn).not.toHaveBeenCalled();
    });

    it('throws on null and undefined campaign ids', () => {
      expect(() => campaignContext.runWithCampaign(null, () => {})).toThrow('Invalid campaign id: null');
      expect(() => campaignContext.runWithCampaign(undefined, () => {})).toThrow('Invalid campaign id: undefined');
    });

    it('does not establish a context when validation fails', () => {
      try {
        campaignContext.runWithCampaign('garbage', () => {});
      } catch (e) {
        // expected
      }
      expect(campaignContext.getCampaignId()).toBe('1');
    });

    it('accepts digit strings, numbers, and "all"', () => {
      expect(() => campaignContext.runWithCampaign('12', () => {})).not.toThrow();
      expect(() => campaignContext.runWithCampaign(7, () => {})).not.toThrow();
      expect(() => campaignContext.runWithCampaign('all', () => {})).not.toThrow();
    });
  });
});
