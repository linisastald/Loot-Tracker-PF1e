// Discord Interaction Handler Server
// Routes Discord interactions to the appropriate campaign instance

const express = require('express');
const axios = require('axios');
const { verifyKey } = require('discord-interactions');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON with raw body for signature verification
app.use('/interactions', express.raw({ type: 'application/json' }));
app.use(express.json());

// Campaign routing configuration
const CAMPAIGN_CONFIG = {
  [process.env.ROTR_CHANNEL_ID]: {
    name: 'ROTR',
    endpoint: process.env.ROTR_API_ENDPOINT || 'http://localhost:5000/api',
    channelId: process.env.ROTR_CHANNEL_ID
  },
  [process.env.SNS_CHANNEL_ID]: {
    name: 'SNS',
    endpoint: process.env.SNS_API_ENDPOINT || 'http://localhost:5001/api',
    channelId: process.env.SNS_CHANNEL_ID
  },
  [process.env.TEST_CHANNEL_ID]: {
    name: 'TEST',
    endpoint: process.env.TEST_API_ENDPOINT || 'http://localhost:5002/api',
    channelId: process.env.TEST_CHANNEL_ID
  }
};

// Discord signature verification middleware
const verifyDiscordRequest = (req, res, next) => {
  const signature = req.get('X-Signature-Ed25519');
  const timestamp = req.get('X-Signature-Timestamp');
  const rawBody = req.body;

  if (!signature || !timestamp || !process.env.DISCORD_PUBLIC_KEY) {
    console.error('Missing Discord verification headers or public key');
    return res.status(401).send('Unauthorized');
  }

  try {
    const isValidRequest = verifyKey(rawBody, signature, timestamp, process.env.DISCORD_PUBLIC_KEY);
    if (!isValidRequest) {
      console.error('Invalid Discord signature');
      return res.status(401).send('Unauthorized');
    }

    // Parse the JSON after verification
    req.body = JSON.parse(rawBody);
    next();
  } catch (error) {
    console.error('Discord verification error:', error);
    return res.status(401).send('Unauthorized');
  }
};

// Route Discord interactions to appropriate campaign instance
const routeToInstance = async (interaction, campaignConfig) => {
  try {
    console.log(`Routing interaction to ${campaignConfig.name} campaign at ${campaignConfig.endpoint}`);

    const response = await axios.post(
      `${campaignConfig.endpoint}/discord/interactions`,
      interaction,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-From': 'discord-handler',
          'X-Campaign-Instance': campaignConfig.name
        },
        timeout: parseInt(process.env.REQUEST_TIMEOUT) || 2500
      }
    );

    return response.data;
  } catch (error) {
    console.error(`Failed to route to ${campaignConfig.name}:`, error.message);

    // Return a fallback response for Discord
    return {
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        content: `⚠️ Sorry, the ${campaignConfig.name} campaign system is temporarily unavailable. Please try again later.`,
        flags: 64 // EPHEMERAL
      }
    };
  }
};

// Main Discord interactions endpoint
app.post('/interactions', verifyDiscordRequest, async (req, res) => {
  const interaction = req.body;

  console.log('Received Discord interaction:', {
    type: interaction.type,
    id: interaction.id,
    channelId: interaction.channel_id,
    timestamp: new Date().toISOString()
  });

  // Handle Discord ping (type 1)
  if (interaction.type === 1) {
    console.log('Responding to Discord ping');
    return res.json({ type: 1 });
  }

  // Handle component interactions (button clicks) - type 3
  if (interaction.type === 3) {
    const channelId = interaction.channel_id;
    const campaignConfig = CAMPAIGN_CONFIG[channelId];

    if (!campaignConfig) {
      console.error(`No campaign configuration found for channel ${channelId}`);
      return res.json({
        type: 4,
        data: {
          content: '⚠️ This channel is not configured for session attendance tracking.',
          flags: 64 // EPHEMERAL
        }
      });
    }

    // Route to appropriate campaign instance
    try {
      const response = await routeToInstance(interaction, campaignConfig);
      return res.json(response);
    } catch (error) {
      console.error('Error routing interaction:', error);
      return res.status(500).json({
        type: 4,
        data: {
          content: '❌ An error occurred processing your response. Please try again.',
          flags: 64 // EPHEMERAL
        }
      });
    }
  }

  // Handle other interaction types (application commands, etc.)
  console.log(`Unhandled interaction type: ${interaction.type}`);
  return res.json({
    type: 4,
    data: {
      content: '❓ Unknown interaction type.',
      flags: 64 // EPHEMERAL
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  const configuredChannels = Object.keys(CAMPAIGN_CONFIG).filter(key => key && key !== 'undefined');

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    configuredCampaigns: configuredChannels.length,
    campaigns: Object.entries(CAMPAIGN_CONFIG)
      .filter(([channelId]) => channelId && channelId !== 'undefined')
      .map(([channelId, config]) => ({
        name: config.name,
        channelId: channelId,
        endpoint: config.endpoint
      }))
  });
});

// Status endpoint for debugging
app.get('/status', (req, res) => {
  res.json({
    service: 'Discord Interaction Handler',
    version: '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: PORT,
      discordKeyConfigured: !!process.env.DISCORD_PUBLIC_KEY,
      requestTimeout: process.env.REQUEST_TIMEOUT || '2500ms'
    },
    campaigns: Object.entries(CAMPAIGN_CONFIG).map(([channelId, config]) => ({
      name: config.name,
      configured: !!channelId && channelId !== 'undefined',
      channelId: channelId || 'NOT_CONFIGURED',
      endpoint: config.endpoint
    }))
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Discord Interaction Handler running on port ${PORT}`);
  console.log('Configured campaigns:', Object.entries(CAMPAIGN_CONFIG)
    .filter(([channelId]) => channelId && channelId !== 'undefined')
    .map(([channelId, config]) => `${config.name} (${channelId})`)
    .join(', ') || 'None configured'
  );

  if (!process.env.DISCORD_PUBLIC_KEY) {
    console.warn('⚠️  DISCORD_PUBLIC_KEY not configured - signature verification will fail');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

module.exports = app;