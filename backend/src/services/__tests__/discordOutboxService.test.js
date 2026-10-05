/**
 * Unit tests for DiscordOutboxService
 *
 * Tests the outbox pattern: enqueue, processOutbox, processMessage,
 * cleanup, and start/stop lifecycle.
 */

const mockExecuteQuery = jest.fn();

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: (...args) => mockExecuteQuery(...args),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

// Mock campaign context but keep the real validation semantics so a row with
// a garbage campaign id throws exactly like the real implementation.
jest.mock('../../utils/campaignContext', () => ({
  runWithCampaign: jest.fn(),
  getCampaignId: jest.fn(),
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

// Mock sessionService (lazy-loaded inside processMessage)
jest.mock('../sessionService', () => ({
  updateSessionMessage: jest.fn(),
}));

const cron = require('node-cron');
const logger = require('../../utils/logger');
const campaignContext = require('../../utils/campaignContext');
const sessionService = require('../sessionService');
const discordOutboxService = require('../discordOutboxService');

describe('DiscordOutboxService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteQuery.mockReset();
    // Re-setup cron mock (resetMocks clears it)
    cron.schedule.mockReturnValue({ stop: jest.fn() });
    // Re-setup campaign context mock (resetMocks clears implementations):
    // pass-through with the real id validation
    campaignContext.runWithCampaign.mockImplementation((campaignId, fn) => {
      const id = String(campaignId);
      if (!/^\d+$|^all$/.test(id)) {
        throw new Error(`Invalid campaign id: ${id}`);
      }
      return fn();
    });
    campaignContext.getCampaignId.mockReturnValue('1');
    // Reset internal state
    discordOutboxService.isProcessing = false;
    discordOutboxService.processingJob = null;
    discordOutboxService.cleanupJob = null;
  });

  // ========================================================================
  // start / stop
  // ========================================================================
  describe('start', () => {
    it('should schedule a cron job running every minute', () => {
      discordOutboxService.start();

      expect(cron.schedule).toHaveBeenCalledWith('* * * * *', expect.any(Function));
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Discord outbox processor started')
      );
    });

    it('should also schedule a daily cleanup of sent messages', async () => {
      mockExecuteQuery.mockResolvedValue({ rowCount: 0 });

      discordOutboxService.start();

      const cleanupCall = cron.schedule.mock.calls.find(call => call[0] !== '* * * * *');
      expect(cleanupCall).toBeDefined();
      await cleanupCall[1]();
      expect(mockExecuteQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM discord_outbox'));
    });
  });

  describe('stop', () => {
    it('should stop both cron jobs if running', () => {
      const processingStop = jest.fn();
      const cleanupStop = jest.fn();
      cron.schedule
        .mockReturnValueOnce({ stop: processingStop })
        .mockReturnValueOnce({ stop: cleanupStop });

      discordOutboxService.start();
      discordOutboxService.stop();

      expect(processingStop).toHaveBeenCalled();
      expect(cleanupStop).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Discord outbox processor stopped')
      );
    });

    it('should not throw if no job is running', () => {
      expect(() => discordOutboxService.stop()).not.toThrow();
    });
  });

  // ========================================================================
  // enqueue
  // ========================================================================
  describe('enqueue', () => {
    it('should insert message into outbox table', async () => {
      const client = { query: jest.fn().mockResolvedValueOnce({}) };

      await discordOutboxService.enqueue(
        client, 'session_update', { sessionId: 42 }, 42
      );

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO discord_outbox'),
        ['session_update', JSON.stringify({ sessionId: 42 }), 42]
      );
    });

    it('should accept null sessionId', async () => {
      const client = { query: jest.fn().mockResolvedValueOnce({}) };

      await discordOutboxService.enqueue(client, 'test_type', { data: 'x' });

      const params = client.query.mock.calls[0][1];
      expect(params[2]).toBeNull();
    });

    it('should serialize payload as JSON', async () => {
      const client = { query: jest.fn().mockResolvedValueOnce({}) };
      const payload = { nested: { deep: true }, arr: [1, 2] };

      await discordOutboxService.enqueue(client, 'test', payload);

      const params = client.query.mock.calls[0][1];
      expect(params[1]).toBe(JSON.stringify(payload));
    });
  });

  // ========================================================================
  // processOutbox
  // ========================================================================
  describe('processOutbox', () => {
    it('should query for pending/failed messages and process them', async () => {
      const messages = [
        {
          id: 1,
          message_type: 'session_update',
          payload: { sessionId: 10 },
          retry_count: 0,
          campaign_id: 1,
        },
      ];
      mockExecuteQuery.mockResolvedValue({});
      mockExecuteQuery.mockResolvedValueOnce({ rows: messages });
      sessionService.updateSessionMessage.mockResolvedValueOnce(true);

      await discordOutboxService.processOutbox();

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('pending', 'failed')"),
      );
      expect(sessionService.updateSessionMessage).toHaveBeenCalledWith(10);
      // Should have set isProcessing back to false
      expect(discordOutboxService.isProcessing).toBe(false);
    });

    it('should also pick up rows stuck in processing after a timeout', async () => {
      mockExecuteQuery.mockResolvedValueOnce({ rows: [] });

      await discordOutboxService.processOutbox();

      const sql = mockExecuteQuery.mock.calls[0][0];
      expect(sql).toMatch(/status = 'processing'\s+AND last_attempt_at < NOW\(\) - INTERVAL '10 minutes'/);
    });

    it('should express the retry backoff once and not select an unused retry_delay column', async () => {
      mockExecuteQuery.mockResolvedValueOnce({ rows: [] });

      await discordOutboxService.processOutbox();

      const sql = mockExecuteQuery.mock.calls[0][0];
      expect(sql).not.toContain('retry_delay');
      expect(sql.match(/POWER\(2, retry_count\)/g)).toHaveLength(1);
    });

    it('should handle empty outbox gracefully', async () => {
      mockExecuteQuery.mockResolvedValueOnce({ rows: [] });

      await discordOutboxService.processOutbox();

      expect(discordOutboxService.isProcessing).toBe(false);
    });

    it('should log error and reset isProcessing on query failure', async () => {
      mockExecuteQuery.mockRejectedValueOnce(new Error('DB down'));

      await discordOutboxService.processOutbox();

      expect(logger.error).toHaveBeenCalledWith(
        'Error processing outbox:',
        expect.any(Error)
      );
      expect(discordOutboxService.isProcessing).toBe(false);
    });

    it('should set isProcessing to true during execution', async () => {
      let capturedState = null;
      mockExecuteQuery.mockImplementationOnce(() => {
        capturedState = discordOutboxService.isProcessing;
        return Promise.resolve({ rows: [] });
      });

      await discordOutboxService.processOutbox();

      expect(capturedState).toBe(true);
    });
  });

  // ========================================================================
  // campaign context (multi-campaign Phase 3c)
  // ========================================================================
  describe('campaign context', () => {
    it('should run the find-work query under cross-campaign mode and each message under its own campaign', async () => {
      const messages = [
        { id: 1, message_type: 'session_update', payload: { sessionId: 10 }, retry_count: 0, campaign_id: 2 },
        { id: 2, message_type: 'session_update', payload: { sessionId: 11 }, retry_count: 0, campaign_id: 5 },
      ];
      mockExecuteQuery.mockResolvedValue({});
      mockExecuteQuery.mockResolvedValueOnce({ rows: messages });
      sessionService.updateSessionMessage.mockResolvedValue(true);

      await discordOutboxService.processOutbox();

      // First context established is the hardcoded 'all' for the SELECT,
      // then one per-row context per message in order
      const contextIds = campaignContext.runWithCampaign.mock.calls.map(call => call[0]);
      expect(contextIds).toEqual(['all', '2', '5']);

      expect(sessionService.updateSessionMessage).toHaveBeenCalledWith(10);
      expect(sessionService.updateSessionMessage).toHaveBeenCalledWith(11);
    });

    it('should process the remaining messages when one row has an invalid campaign id', async () => {
      const messages = [
        // campaign_id missing -> String(undefined) fails validation and throws
        { id: 1, message_type: 'session_update', payload: { sessionId: 10 }, retry_count: 0 },
        { id: 2, message_type: 'session_update', payload: { sessionId: 11 }, retry_count: 0, campaign_id: 3 },
      ];
      mockExecuteQuery.mockResolvedValue({});
      mockExecuteQuery.mockResolvedValueOnce({ rows: messages });
      sessionService.updateSessionMessage.mockResolvedValue(true);

      await discordOutboxService.processOutbox();

      // First row failed before processing, second row still processed
      expect(sessionService.updateSessionMessage).toHaveBeenCalledTimes(1);
      expect(sessionService.updateSessionMessage).toHaveBeenCalledWith(11);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to process outbox message in campaign context',
        expect.objectContaining({ id: 1 })
      );
      expect(discordOutboxService.isProcessing).toBe(false);
    });

    it('should run cleanup under cross-campaign mode', async () => {
      mockExecuteQuery.mockResolvedValueOnce({ rowCount: 0 });

      await discordOutboxService.cleanup();

      expect(campaignContext.runWithCampaign).toHaveBeenCalledWith('all', expect.any(Function));
    });
  });

  // ========================================================================
  // processMessage
  // ========================================================================
  describe('processMessage', () => {
    const sqlCalls = () => mockExecuteQuery.mock.calls.map(c => c[0]).filter(q => typeof q === 'string');

    it('should process session_update message and mark it sent', async () => {
      const message = { id: 2, message_type: 'session_update', payload: { sessionId: 10 }, retry_count: 0 };
      mockExecuteQuery.mockResolvedValue({});
      sessionService.updateSessionMessage.mockResolvedValueOnce(true);

      await discordOutboxService.processMessage(message);

      expect(sessionService.updateSessionMessage).toHaveBeenCalledWith(10);
      expect(sqlCalls().some(q => q.includes("status = 'sent'"))).toBe(true);
    });

    it('should mark the message as processing and count a re-pickup of a stuck row as an attempt', async () => {
      const message = { id: 2, message_type: 'session_update', payload: { sessionId: 10 }, retry_count: 0 };
      mockExecuteQuery.mockResolvedValue({});
      sessionService.updateSessionMessage.mockResolvedValueOnce(true);

      await discordOutboxService.processMessage(message);

      const processing = sqlCalls().find(q => q.includes("status = 'processing'") && q.includes('SET'));
      expect(processing).toMatch(/retry_count = CASE WHEN status = 'processing' THEN retry_count \+ 1 ELSE retry_count END/);
    });

    it('should mark an unknown message type as failed instead of silently sent', async () => {
      const message = { id: 4, message_type: 'unknown_type', payload: {}, retry_count: 0 };
      mockExecuteQuery.mockResolvedValue({});

      await discordOutboxService.processMessage(message);

      const sql = sqlCalls();
      expect(sql.some(q => q.includes("status = 'sent'"))).toBe(false);
      const failedCall = mockExecuteQuery.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes("status = 'failed'")
      );
      expect(failedCall[1][1]).toContain('Unknown outbox message type: unknown_type');
    });

    it('should mark message as failed on error and increment retry_count', async () => {
      const message = { id: 5, message_type: 'session_update', payload: { sessionId: 10 }, retry_count: 1 };
      mockExecuteQuery.mockResolvedValue({});
      sessionService.updateSessionMessage.mockRejectedValueOnce(new Error('Discord API error'));

      await discordOutboxService.processMessage(message);

      const failedCall = mockExecuteQuery.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes("status = 'failed'")
      );
      expect(failedCall).toBeDefined();
      expect(failedCall[1]).toContain('Discord API error');
    });

    it('should not throw when processing fails', async () => {
      const message = { id: 6, message_type: 'session_update', payload: { sessionId: 10 }, retry_count: 0 };
      mockExecuteQuery.mockResolvedValue({});
      sessionService.updateSessionMessage.mockRejectedValueOnce(new Error('fail'));

      await expect(discordOutboxService.processMessage(message)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to process outbox message',
        expect.objectContaining({ id: 6, error: 'fail' })
      );
    });
  });

  // ========================================================================
  // Discord failure results (F-0677)
  // ========================================================================
  describe('processMessage Discord failure results', () => {
    const run = async (type, payload) => {
      mockExecuteQuery.mockResolvedValue({});
      await discordOutboxService.processMessage({ id: 9, message_type: type, payload, retry_count: 0 });
      const sql = mockExecuteQuery.mock.calls.map(c => c[0]).filter(q => typeof q === 'string');
      return {
        sent: sql.some(q => q.includes("status = 'sent'")),
        failed: sql.some(q => q.includes("status = 'failed'") && q.includes('retry_count = retry_count + 1')),
      };
    };

    it('marks session_update failed when the update resolves false', async () => {
      sessionService.updateSessionMessage.mockResolvedValueOnce(false);
      expect(await run('session_update', { sessionId: 1 })).toEqual({ sent: false, failed: true });
    });

    it('marks session_update sent when the update succeeds', async () => {
      sessionService.updateSessionMessage.mockResolvedValueOnce(true);
      expect(await run('session_update', { sessionId: 1 })).toEqual({ sent: true, failed: false });
    });
  });

  // ========================================================================
  // cleanup
  // ========================================================================
  describe('cleanup', () => {
    it('should delete sent messages older than 7 days', async () => {
      mockExecuteQuery.mockResolvedValueOnce({ rowCount: 5 });

      await discordOutboxService.cleanup();

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'sent'")
      );
      expect(mockExecuteQuery.mock.calls[0][0]).toContain('7 days');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 5 old outbox messages')
      );
    });

    it('should not log when no messages cleaned up', async () => {
      mockExecuteQuery.mockResolvedValueOnce({ rowCount: 0 });

      await discordOutboxService.cleanup();

      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up')
      );
    });

    it('should handle errors gracefully', async () => {
      mockExecuteQuery.mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      await discordOutboxService.cleanup();

      expect(logger.error).toHaveBeenCalledWith(
        'Error cleaning up outbox:',
        expect.any(Error)
      );
    });
  });
});
