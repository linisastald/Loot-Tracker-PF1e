/**
 * Tests for emailService.js - Email functionality
 * Tests email configuration, password reset emails, and error handling
 */

const EmailService = require('../../../backend/src/services/emailService');
const nodemailer = require('nodemailer');
const logger = require('../../../backend/src/utils/logger');
const dbUtils = require('../../../backend/src/utils/dbUtils');

// Mock dependencies
jest.mock('nodemailer');
jest.mock('../../../backend/src/utils/logger');
jest.mock('../../../backend/src/utils/dbUtils');

describe('EmailService', () => {
  let mockTransporter;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTransporter = {
      verify: jest.fn(),
      sendMail: jest.fn()
    };

    nodemailer.createTransporter.mockReturnValue(mockTransporter);

    // Clear environment variables
    delete process.env.EMAIL_SERVICE;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.FRONTEND_URL;

    logger.warn = jest.fn();
    logger.error = jest.fn();
    logger.info = jest.fn();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with Gmail configuration', () => {
      process.env.EMAIL_SERVICE = 'gmail';
      process.env.EMAIL_USER = 'test@gmail.com';
      process.env.EMAIL_PASS = 'app-password';

      // Reset modules to test initialization
      jest.resetModules();
      require('../../../backend/src/services/emailService');

      expect(nodemailer.createTransporter).toHaveBeenCalledWith({
        service: 'gmail',
        auth: {
          user: 'test@gmail.com',
          pass: 'app-password'
        }
      });
    });

    it('should initialize with SMTP configuration', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '465';
      process.env.SMTP_SECURE = 'true';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'password';

      jest.resetModules();
      require('../../../backend/src/services/emailService');

      expect(nodemailer.createTransporter).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: '465',
        secure: true,
        auth: {
          user: 'user@example.com',
          pass: 'password'
        }
      });
    });

    it('should use default port when not specified', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'password';

      jest.resetModules();
      require('../../../backend/src/services/emailService');

      expect(nodemailer.createTransporter).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'user@example.com',
          pass: 'password'
        }
      });
    });

    it('should handle missing email configuration', () => {
      jest.resetModules();
      require('../../../backend/src/services/emailService');

      expect(logger.warn).toHaveBeenCalledWith(
        'Email service not configured. Password reset emails will not be sent.'
      );
      expect(nodemailer.createTransporter).not.toHaveBeenCalled();
    });

    it('should verify transporter on successful configuration', () => {
      process.env.EMAIL_SERVICE = 'gmail';
      process.env.EMAIL_USER = 'test@gmail.com';
      process.env.EMAIL_PASS = 'app-password';

      mockTransporter.verify.mockImplementation((callback) => {
        callback(null, true);
      });

      jest.resetModules();
      require('../../../backend/src/services/emailService');

      expect(mockTransporter.verify).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Email service ready');
    });

    it('should handle transporter verification errors', () => {
      process.env.EMAIL_SERVICE = 'gmail';
      process.env.EMAIL_USER = 'test@gmail.com';
      process.env.EMAIL_PASS = 'app-password';

      const verifyError = new Error('Authentication failed');
      mockTransporter.verify.mockImplementation((callback) => {
        callback(verifyError, false);
      });

      jest.resetModules();
      require('../../../backend/src/services/emailService');

      expect(logger.error).toHaveBeenCalledWith('Email service configuration error:', verifyError);
    });

    it('should handle transporter creation errors', () => {
      process.env.EMAIL_SERVICE = 'gmail';
      process.env.EMAIL_USER = 'test@gmail.com';
      process.env.EMAIL_PASS = 'app-password';

      nodemailer.createTransporter.mockImplementation(() => {
        throw new Error('Transporter creation failed');
      });

      jest.resetModules();
      require('../../../backend/src/services/emailService');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize email service:',
        expect.any(Error)
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    beforeEach(() => {
      // Setup valid email service
      process.env.EMAIL_SERVICE = 'gmail';
      process.env.EMAIL_USER = 'test@gmail.com';
      process.env.EMAIL_PASS = 'app-password';
      process.env.FRONTEND_URL = 'https://example.com';

      mockTransporter.verify.mockImplementation((callback) => {
        callback(null, true);
      });

      // Mock campaign name query
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ value: 'Test Campaign' }]
      });
    });

    it('should send password reset email successfully', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      const result = await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        'reset-token-123'
      );

      expect(dbUtils.executeQuery).toHaveBeenCalledWith(
        "SELECT value FROM settings WHERE name = 'campaign_name'"
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'testcampaign@kempsonandko.com',
        to: 'user@example.com',
        subject: 'Password Reset Request - Pathfinder Loot Tracker',
        html: expect.stringContaining('Hello testuser')
      });

      expect(logger.info).toHaveBeenCalledWith('Password reset email sent to user@example.com');
      expect(result).toBe(true);
    });

    it('should return false when transporter is not configured', async () => {
      jest.resetModules();
      // Don't set email environment variables
      const emailService = require('../../../backend/src/services/emailService');

      const result = await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        'reset-token-123'
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Email service not configured. Cannot send password reset email.'
      );
      expect(result).toBe(false);
    });

    it('should handle database query errors gracefully', async () => {
      dbUtils.executeQuery.mockRejectedValue(new Error('Database error'));
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      const result = await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        'reset-token-123'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send password reset email:',
        expect.any(Error)
      );
      expect(result).toBe(false);
    });

    it('should use default campaign name when not found in database', async () => {
      dbUtils.executeQuery.mockResolvedValue({ rows: [] });
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        'reset-token-123'
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'campaign@kempsonandko.com'
        })
      );
    });

    it('should sanitize campaign name for email address', async () => {
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ value: 'My Special Campaign! @#$%' }]
      });
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        'reset-token-123'
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'myspecialcampaign@kempsonandko.com'
        })
      );
    });

    it('should limit sanitized campaign name length', async () => {
      const longCampaignName = 'a'.repeat(100);
      dbUtils.executeQuery.mockResolvedValue({
        rows: [{ value: longCampaignName }]
      });
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        'reset-token-123'
      );

      const fromEmail = mockTransporter.sendMail.mock.calls[0][0].from;
      const sanitizedPart = fromEmail.split('@')[0];
      expect(sanitizedPart.length).toBeLessThanOrEqual(64);
    });

    it('should include correct reset URL in email', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        'reset-token-123'
      );

      const emailContent = mockTransporter.sendMail.mock.calls[0][0].html;
      expect(emailContent).toContain('https://example.com/reset-password?token=reset-token-123');
    });

    it('should use default frontend URL when not specified', async () => {
      delete process.env.FRONTEND_URL;
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        'reset-token-123'
      );

      const emailContent = mockTransporter.sendMail.mock.calls[0][0].html;
      expect(emailContent).toContain('http://localhost:3000/reset-password?token=reset-token-123');
    });

    it('should handle email sending errors', async () => {
      const sendError = new Error('SMTP connection failed');
      mockTransporter.sendMail.mockRejectedValue(sendError);

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      const result = await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        'reset-token-123'
      );

      expect(logger.error).toHaveBeenCalledWith('Failed to send password reset email:', sendError);
      expect(result).toBe(false);
    });

    it('should include user-specific content in email', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      await emailService.sendPasswordResetEmail(
        'user@example.com',
        'JohnDoe',
        'unique-token-456'
      );

      const mailOptions = mockTransporter.sendMail.mock.calls[0][0];
      expect(mailOptions.to).toBe('user@example.com');
      expect(mailOptions.html).toContain('Hello JohnDoe');
      expect(mailOptions.html).toContain('unique-token-456');
    });

    it('should include proper email styling and structure', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        'reset-token-123'
      );

      const emailContent = mockTransporter.sendMail.mock.calls[0][0].html;
      expect(emailContent).toContain('<h2>Password Reset Request</h2>');
      expect(emailContent).toContain('style="display: inline-block');
      expect(emailContent).toContain('This link will expire in 1 hour');
      expect(emailContent).toContain('Pathfinder Loot Tracker Team');
    });

    it('should handle special characters in username', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      await emailService.sendPasswordResetEmail(
        'user@example.com',
        "O'Reilly & Co.",
        'reset-token-123'
      );

      const emailContent = mockTransporter.sendMail.mock.calls[0][0].html;
      expect(emailContent).toContain("Hello O'Reilly & Co.");
    });

    it('should handle special characters in reset token', async () => {
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      const specialToken = 'token-with-special-chars+/=';
      await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        specialToken
      );

      const emailContent = mockTransporter.sendMail.mock.calls[0][0].html;
      expect(emailContent).toContain(specialToken);
    });
  });

  describe('Environment Variable Handling', () => {
    it('should handle Gmail with missing credentials', () => {
      process.env.EMAIL_SERVICE = 'gmail';
      // Don't set EMAIL_USER or EMAIL_PASS

      jest.resetModules();
      require('../../../backend/src/services/emailService');

      expect(nodemailer.createTransporter).toHaveBeenCalledWith({
        service: 'gmail',
        auth: {
          user: undefined,
          pass: undefined
        }
      });
    });

    it('should handle SMTP with partial configuration', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      // Don't set other SMTP variables

      jest.resetModules();
      require('../../../backend/src/services/emailService');

      expect(nodemailer.createTransporter).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: undefined,
          pass: undefined
        }
      });
    });

    it('should handle secure flag variations', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_SECURE = 'false';

      jest.resetModules();
      require('../../../backend/src/services/emailService');

      expect(nodemailer.createTransporter).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: false
        })
      );
    });

    it('should handle non-boolean secure flag', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_SECURE = 'yes';

      jest.resetModules();
      require('../../../backend/src/services/emailService');

      expect(nodemailer.createTransporter).toHaveBeenCalledWith(
        expect.objectContaining({
          secure: false // Should default to false for non-'true' values
        })
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle very long usernames', async () => {
      process.env.EMAIL_SERVICE = 'gmail';
      process.env.EMAIL_USER = 'test@gmail.com';
      process.env.EMAIL_PASS = 'app-password';

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ value: 'Test Campaign' }] });
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      const longUsername = 'a'.repeat(1000);
      const result = await emailService.sendPasswordResetEmail(
        'user@example.com',
        longUsername,
        'reset-token-123'
      );

      expect(result).toBe(true);
      const emailContent = mockTransporter.sendMail.mock.calls[0][0].html;
      expect(emailContent).toContain(longUsername);
    });

    it('should handle empty campaign name', async () => {
      process.env.EMAIL_SERVICE = 'gmail';
      process.env.EMAIL_USER = 'test@gmail.com';
      process.env.EMAIL_PASS = 'app-password';

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ value: '' }] });
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        'reset-token-123'
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '@kempsonandko.com' // Empty sanitized name
        })
      );
    });

    it('should handle null campaign name from database', async () => {
      process.env.EMAIL_SERVICE = 'gmail';
      process.env.EMAIL_USER = 'test@gmail.com';
      process.env.EMAIL_PASS = 'app-password';

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ value: null }] });
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      await emailService.sendPasswordResetEmail(
        'user@example.com',
        'testuser',
        'reset-token-123'
      );

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'campaign@kempsonandko.com'
        })
      );
    });

    it('should handle concurrent email sending', async () => {
      process.env.EMAIL_SERVICE = 'gmail';
      process.env.EMAIL_USER = 'test@gmail.com';
      process.env.EMAIL_PASS = 'app-password';

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ value: 'Test Campaign' }] });
      mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      const promises = [
        emailService.sendPasswordResetEmail('user1@example.com', 'user1', 'token1'),
        emailService.sendPasswordResetEmail('user2@example.com', 'user2', 'token2'),
        emailService.sendPasswordResetEmail('user3@example.com', 'user3', 'token3')
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual([true, true, true]);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success and failure in concurrent emails', async () => {
      process.env.EMAIL_SERVICE = 'gmail';
      process.env.EMAIL_USER = 'test@gmail.com';
      process.env.EMAIL_PASS = 'app-password';

      dbUtils.executeQuery.mockResolvedValue({ rows: [{ value: 'Test Campaign' }] });
      mockTransporter.sendMail
        .mockResolvedValueOnce({ messageId: 'success1' })
        .mockRejectedValueOnce(new Error('SMTP error'))
        .mockResolvedValueOnce({ messageId: 'success2' });

      jest.resetModules();
      const emailService = require('../../../backend/src/services/emailService');

      const promises = [
        emailService.sendPasswordResetEmail('user1@example.com', 'user1', 'token1'),
        emailService.sendPasswordResetEmail('user2@example.com', 'user2', 'token2'),
        emailService.sendPasswordResetEmail('user3@example.com', 'user3', 'token3')
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual([true, false, true]);
    });
  });

  describe('Singleton Instance', () => {
    it('should return same instance on multiple requires', () => {
      process.env.EMAIL_SERVICE = 'gmail';
      process.env.EMAIL_USER = 'test@gmail.com';
      process.env.EMAIL_PASS = 'app-password';

      jest.resetModules();
      const emailService1 = require('../../../backend/src/services/emailService');
      const emailService2 = require('../../../backend/src/services/emailService');

      expect(emailService1).toBe(emailService2);
    });
  });
});