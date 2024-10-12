const axios = require('axios');
const pool = require('../config/db');

exports.sendMessage = async (req, res) => {
  try {
    const { embeds } = req.body;
    const settings = await pool.query(
      'SELECT name, value FROM settings WHERE name IN (\'discord_bot_token\', \'discord_channel_id\')'
    );

    const { discord_bot_token, discord_channel_id } = settings.rows.reduce((acc, row) => {
      acc[row.name] = row.value;
      return acc;
    }, {});

    if (!discord_bot_token || !discord_channel_id) {
      return res.status(400).json({ error: 'Discord settings are not configured' });
    }

    // Send each embed separately
    for (const embed of embeds) {
      await axios.post(
        `https://discordapp.com/api/channels/${discord_channel_id}/messages`,
        embed,
        { headers: { Authorization: `Bot ${discord_bot_token}` } }
      );
    }

    res.json({ success: true, message: 'Tasks sent to Discord successfully' });
  } catch (error) {
    console.error('Error sending message to Discord:', error);
    res.status(500).json({ error: 'Failed to send message to Discord' });
  }
};