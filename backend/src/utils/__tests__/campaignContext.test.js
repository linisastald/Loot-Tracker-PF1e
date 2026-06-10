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
});
