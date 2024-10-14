const pool = require('../config/db');

exports.getDiscordSettings = async (req, res) => {
  try {
    const settings = await pool.query(
      'SELECT name, value FROM settings WHERE name IN (\'discord_bot_token\', \'discord_channel_id\')'
    );

    const formattedSettings = settings.rows.reduce((acc, row) => {
      acc[row.name] = row.value;
      return acc;
    }, {});

    res.json(formattedSettings);
  } catch (error) {
    console.error('Error fetching Discord settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getCampaignName = async (req, res) => {
  try {
    const result = await pool.query('SELECT value FROM settings WHERE name = \'campaign_name\'');
    const campaignName = result.rows[0]?.value || 'Loot Tracker';
    res.json({ value: campaignName });
  } catch (error) {
    console.error('Error fetching campaign name:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};