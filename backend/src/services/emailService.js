// src/services/emailService.js
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
require('dotenv').config();

class EmailService {
    constructor() {
        this.transporter = null;
        this.initializeTransporter();
    }

    initializeTransporter() {
        try {
            // Configure based on environment variables
            if (process.env.EMAIL_SERVICE === 'gmail') {
                this.transporter = nodemailer.createTransporter({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS // App password for Gmail
                    }
                });
            } else if (process.env.SMTP_HOST) {
                this.transporter = nodemailer.createTransporter({
                    host: process.env.SMTP_HOST,
                    port: process.env.SMTP_PORT || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                });
            } else {
                logger.warn('Email service not configured. Password reset emails will not be sent.');
                return;
            }

            // Verify transporter configuration
            this.transporter.verify((error, success) => {
                if (error) {
                    logger.error('Email service configuration error:', error);
                } else {
                    logger.info('Email service ready');
                }
            });
        } catch (error) {
            logger.error('Failed to initialize email service:', error);
        }
    }

    async sendPasswordResetEmail(userEmail, username, resetToken) {
        if (!this.transporter) {
            logger.warn('Email service not configured. Cannot send password reset email.');
            return false;
        }

        try {
            // Get campaign name from database for the email address
            const dbUtils = require('../utils/dbUtils');
            const campaignResult = await dbUtils.executeQuery(
                "SELECT value FROM settings WHERE name = 'campaign_name'"
            );
            const campaignName = campaignResult.rows[0]?.value || 'campaign';
            // Sanitize campaign name for email address (remove special characters, spaces, etc.)
            const sanitizedCampaignName = campaignName
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric characters
                .substring(0, 64); // Limit length for email standards
            const fromEmail = `${sanitizedCampaignName}@kempsonandko.com`;
            
            const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
            
            const mailOptions = {
                from: fromEmail,
                to: userEmail,
                subject: 'Password Reset Request - Pathfinder Loot Tracker',
                html: `
                    <h2>Password Reset Request</h2>
                    <p>Hello ${username},</p>
                    <p>You have requested to reset your password for the Pathfinder Loot Tracker.</p>
                    <p>Click the link below to reset your password:</p>
                    <p><a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
                    <p>If the button doesn't work, copy and paste this link into your browser:</p>
                    <p>${resetUrl}</p>
                    <p>This link will expire in 1 hour.</p>
                    <p>If you did not request this password reset, please ignore this email.</p>
                    <br>
                    <p>Best regards,<br>Pathfinder Loot Tracker Team</p>
                `
            };

            const result = await this.transporter.sendMail(mailOptions);
            logger.info(`Password reset email sent to ${userEmail}`);
            return true;
        } catch (error) {
            logger.error('Failed to send password reset email:', error);
            return false;
        }
    }
}

module.exports = new EmailService();
