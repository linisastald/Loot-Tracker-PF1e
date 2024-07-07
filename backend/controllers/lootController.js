const Loot = require('../models/Loot');

exports.createLoot = async (req, res) => {
  const { item_name, item_description, campaign_id } = req.body;
  const newItem = await Loot.create(item_name, item_description, campaign_id);
  res.json(newItem);
};

exports.getAllLoot = async (req, res) => {
  const { campaign_id } = req.query;
  const loot = await Loot.findAll(campaign_id);
  res.json(loot);
};

exports.updateLootStatus = async (req, res) => {
  const { id, status } = req.body;
  const updatedItem = await Loot.updateStatus(id, status);
  res.json(updatedItem);
};
