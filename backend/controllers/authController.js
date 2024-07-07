const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.register = async (req, res) => {
  const { character_name, password, campaign_id } = req.body;
  const user = await User.findByCharacterName(character_name);
  if (user) {
    return res.status(400).json({ message: 'Character name already exists' });
  }
  const password_hash = await bcrypt.hash(password, 10);
  const newUser = await User.create(character_name, password_hash, campaign_id);
  const token = jwt.sign({ id: newUser.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, user: newUser });
};

exports.login = async (req, res) => {
  const { character_name, password } = req.body;
  const user = await User.findByCharacterName(character_name);
  if (!user) {
    return res.status(400).json({ message: 'Character name or password is incorrect' });
  }
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return res.status(400).json({ message: 'Character name or password is incorrect' });
  }
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, user });
};
