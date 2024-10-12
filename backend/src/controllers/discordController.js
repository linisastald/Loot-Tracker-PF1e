const axios = require('axios');
const pool = require('../config/db');

exports.sendMessage = async (req, res) => {
  try {
    const { message } = req.body;
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

    const response = await axios.post(
      `https://discordapp.com/api/channels/${discord_channel_id}/messages`,
      { content: message },
      { headers: { Authorization: `Bot ${discord_bot_token}` } }
    );

    res.json({ success: true, message: 'Message sent to Discord' });
  } catch (error) {
    console.error('Error sending message to Discord:', error);
    res.status(500).json({ error: 'Failed to send message to Discord' });
  }
};