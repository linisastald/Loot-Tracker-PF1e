/**
 * Unit tests for DiscordOutboxService
 *
 * Tests the outbox pattern: enqueue, processOutbox, processMessage,
 * backoff calculation, cleanup, and start/stop lifecycle.
 */

const mockExecuteQuery = jest.fn();
const mockExecuteTransaction = jest.fn();
const mockClient = {
  query: jest.fn(),
};

jest.mock('../../utils/dbUtils', () => ({
  executeQuery: (...args) => mockExecuteQuery(...args),
  executeTransaction: (...args) => mockExecuteTransaction(...args),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn((pattern, callback) => {
    // Store the callback so tests can trigger it
    return { stop: jest.fn(), _callback: callback };
  }),
}));

// Mock sessionService (lazy-loaded inside processMessage)
jest.mock('../sessionService', () => ({
  postSessionAnnouncement: jest.fn(),
  updateSessionMessage: jest.fn(),
  getDiscordSettings: jest.fn(),
}));

jest.mock('../discordBrokerService', () => ({
  sendMessage: jest.fn(),
}));

const cron = require('node-cron');
const logger = require('../../utils/logger');

// Need to re-require to get fresh singleton since module is cached
// Clear the module from cache so we get a clean instance
let discordOutboxService;
beforeAll(() => {
  // The module exports a singleton, so we just require it
  discordOutboxService = require('../discordOutboxService');
});

describe('DiscordOutboxService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockReset();
    mockExecuteQuery.mockReset();
    mockExecuteTransaction.mockReset();
    // Transaction callbacks receive a mock client
    mockExecuteTransaction.mockImplementation(async (cb) => cb(mockClient));
    // Re-setup cron mock (resetMocks clears it)
    cron.schedule.mockReturnValue({ stop: jest.fn() });
    // Reset internal state
    discordOutboxService.isProcessing = false;
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
  });

  describe('stop', () => {
    it('should stop the cron job if running', () => {
      // Set up a mock job with a stop function
      const mockStop = jest.fn();
      cron.schedule.mockReturnValueOnce({ stop: mockStop });

      discordOutboxService.start();
      discordOutboxService.stop();

      expect(mockStop).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Discord outbox processor stopped')
      );
    });

    it('should not throw if no job is running', () => {
      discordOutboxService.processingJob = null;
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
        client, 'session_announcement', { sessionId: 42 }, 42
      );

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO discord_outbox'),
        ['session_announcement', JSON.stringify({ sessionId: 42 }), 42]
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
  // calculateBackoffDelay
  // ========================================================================
  describe('calculateBackoffDelay', () => {
    it('should return 5 minutes for retry 0', () => {
      expect(discordOutboxService.calculateBackoffDelay(0)).toBe(5 * 60 * 1000);
    });

    it('should double with each retry', () => {
      expect(discordOutboxService.calculateBackoffDelay(1)).toBe(10 * 60 * 1000);
      expect(discordOutboxService.calculateBackoffDelay(2)).toBe(20 * 60 * 1000);
      expect(discordOutboxService.calculateBackoffDelay(3)).toBe(40 * 60 * 1000);
    });

    it('should cap at 1 hour', () => {
      expect(discordOutboxService.calculateBackoffDelay(4)).toBe(60 * 60 * 1000);
      expect(discordOutboxService.calculateBackoffDelay(10)).toBe(60 * 60 * 1000);
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
          message_type: 'session_announcement',
          payload: { sessionId: 10 },
          retry_count: 0,
        },
      ];
      mockExecuteQuery.mockResolvedValue({});
      mockExecuteQuery.mockResolvedValueOnce({ rows: messages });

      // processMessage will mark as processing, call sessionService, mark as sent
      const sessionService = require('../sessionService');
      sessionService.postSessionAnnouncement.mockResolvedValueOnce({});

      await discordOutboxService.processOutbox();

      expect(mockExecuteQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('pending', 'failed')"),
      );
      // Should have set isProcessing back to false
      expect(discordOutboxService.isProcessing).toBe(false);
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
  // processMessage
  // ========================================================================
  describe('processMessage', () => {
    it('should process session_announcement message', async () => {
      const message = {
        id: 1,
        message_type: 'session_announcement',
        payload: { sessionId: 10 },
        retry_count: 0,
      };
      mockExecuteQuery.mockResolvedValue({});

      const sessionService = require('../sessionService');
      sessionService.postSessionAnnouncement.mockResolvedValueOnce({});

      await discordOutboxService.processMessage(message);

      expect(sessionService.postSessionAnnouncement).toHaveBeenCalledWith(10);
      // Should mark as sent
      const sentCall = mockExecuteQuery.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes("status = 'sent'")
      );
      expect(sentCall).toBeDefined();
    });

    it('should process session_update message', async () => {
      const message = {
        id: 2,
        message_type: 'session_update',
        payload: { sessionId: 10 },
        retry_count: 0,
      };
      mockExecuteQuery.mockResolvedValue({});

      const sessionService = require('../sessionService');
      sessionService.updateSessionMessage.mockResolvedValueOnce({});

      await discordOutboxService.processMessage(message);

      expect(sessionService.updateSessionMessage).toHaveBeenCalledWith(10);
    });

    it('should process session_cancellation message', async () => {
      const message = {
        id: 3,
        message_type: 'session_cancellation',
        payload: { message: 'Session cancelled' },
        retry_count: 0,
      };
      mockExecuteQuery.mockResolvedValue({});

      const sessionService = require('../sessionService');
      sessionService.getDiscordSettings.mockResolvedValueOnce({
        campaign_role_id: '123',
        discord_channel_id: '456',
      });

      const discordBroker = require('../discordBrokerService');
      discordBroker.sendMessage.mockResolvedValueOnce({});

      await discordOutboxService.processMessage(message);

      expect(discordBroker.sendMessage).toHaveBeenCalledWith({
        channelId: '456',
        content: 'Session cancelled',
      });
    });

    it('should log warning for unknown message type', async () => {
      const message = {
        id: 4,
        message_type: 'unknown_type',
        payload: {},
        retry_count: 0,
      };
      mockExecuteQuery.mockResolvedValue({});

      await discordOutboxService.processMessage(message);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown outbox message type: unknown_type')
      );
    });

    it('should mark message as failed on error and increment retry_count', async () => {
      const message = {
        id: 5,
        message_type: 'session_announcement',
        payload: { sessionId: 10 },
        retry_count: 1,
      };

      mockExecuteQuery
        .mockResolvedValueOnce({}) // UPDATE processing
        .mockResolvedValueOnce({}); // UPDATE failed

      const sessionService = require('../sessionService');
      sessionService.postSessionAnnouncement.mockRejectedValueOnce(new Error('Discord API error'));

      await discordOutboxService.processMessage(message);

      const failedCall = mockExecuteQuery.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes("status = 'failed'")
      );
      expect(failedCall).toBeDefined();
      expect(failedCall[1]).toContain('Discord API error');
    });

    it('should not throw when processing fails', async () => {
      const message = {
        id: 6,
        message_type: 'session_announcement',
        payload: { sessionId: 10 },
        retry_count: 0,
      };
      mockExecuteQuery.mockResolvedValueOnce({}); // mark processing

      const sessionService = require('../sessionService');
      sessionService.postSessionAnnouncement.mockRejectedValueOnce(new Error('fail'));
      mockExecuteQuery.mockResolvedValueOnce({}); // mark failed

      await expect(discordOutboxService.processMessage(message)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to process outbox message',
        expect.objectContaining({ id: 6, error: 'fail' })
      );
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
