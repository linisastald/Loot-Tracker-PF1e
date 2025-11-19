// src/controllers/spellcastingController.js
const SpellcastingService = require('../models/SpellcastingService');
const City = require('../models/City');
const controllerFactory = require('../utils/controllerFactory');
const dbUtils = require('../utils/dbUtils');
const logger = require('../utils/logger');

/**
 * Check spellcasting service availability and cost
 */
const checkSpellcastingService = async (req, res) => {
  const {
    spell_id,
    spell_name,
    spell_level,
    caster_level,
    city_name,
    city_size,
    character_id,
    notes,
    purchase = false // If true, record the service purchase
  } = req.body;

  // Validation
  if (!spell_name || !spell_name.trim()) {
    throw controllerFactory.createValidationError('Spell name is required');
  }

  if (spell_level === undefined || spell_level === null) {
    throw controllerFactory.createValidationError('Spell level is required');
  }

  if (!caster_level || caster_level < 1) {
    throw controllerFactory.createValidationError('Valid caster level is required (minimum 1)');
  }

  if (!city_name || !city_name.trim()) {
    throw controllerFactory.createValidationError('City name is required');
  }

  if (!city_size) {
    throw controllerFactory.createValidationError('City size is required');
  }

  // Validate spell level range
  if (spell_level < 0 || spell_level > 9) {
    throw controllerFactory.createValidationError('Spell level must be between 0 and 9');
  }

  // Get current Golarion date
  const currentDateResult = await dbUtils.executeQuery('SELECT * FROM golarion_current_date LIMIT 1');
  const golarionDate = currentDateResult.rows.length > 0
    ? `${currentDateResult.rows[0].year}-${String(currentDateResult.rows[0].month).padStart(2, '0')}-${String(currentDateResult.rows[0].day).padStart(2, '0')}`
    : null;

  // Get or create the city
  const city = await City.getOrCreate(city_name.trim(), city_size);

  // Check if spell is available in this city
  const availabilityCheck = SpellcastingService.isSpellAvailable(spell_level, city.max_spell_level);

  if (!availabilityCheck.available) {
    let message;
    if (availabilityCheck.reason === 'no_spellcasters') {
      message = `${city.name} is a village with no spellcasters available for ${spell_name}.`;
    } else if (availabilityCheck.reason === 'village_no_spellcaster') {
      message = `${city.name} is a village. After searching, no spellcaster capable of casting ` +
                `${spell_name} was found (rolled ${availabilityCheck.roll}/100, needed 5 or less).`;
    } else if (availabilityCheck.reason === 'exceeds_max_level') {
      message = `${spell_name} (level ${spell_level}) is not available in ${city.name}. ` +
                `Maximum spell level available: ${city.max_spell_level}`;
    } else if (availabilityCheck.reason === 'level_9_not_found') {
      message = `${spell_name} is a 9th level spell. After searching ${city.name}, ` +
                `no caster capable of casting it was found (rolled ${availabilityCheck.roll}/100, needed 1 or less).`;
    }

    return res.json({
      available: false,
      city,
      spell_name: spell_name.trim(),
      spell_level,
      caster_level,
      max_spell_level: city.max_spell_level,
      message,
      availability_check: availabilityCheck
    });
  }

  // Calculate cost
  const cost = SpellcastingService.calculateCost(spell_level, caster_level);

  // If purchasing, record the service
  let serviceRecord = null;
  if (purchase) {
    serviceRecord = await SpellcastingService.create({
      spell_id: spell_id || null,
      spell_name: spell_name.trim(),
      spell_level,
      caster_level,
      city_id: city.id,
      character_id: character_id || null,
      golarion_date: golarionDate,
      notes: notes || null
    });

    logger.info(
      `Spellcasting service purchased: ${spell_name} (level ${spell_level}, ` +
      `CL ${caster_level}) in ${city.name} - Cost: ${cost}gp`
    );
  }

  // Build response message for special availability cases
  let successMessage = null;
  if (availabilityCheck.reason === 'village_spellcaster_found') {
    successMessage = `Lucky find! A wandering spellcaster capable of casting ${spell_name} was found in ` +
                    `${city.name} (rolled ${availabilityCheck.roll}/100, needed 5 or less).`;
  } else if (availabilityCheck.reason === 'level_9_found') {
    successMessage = `Lucky find! A caster capable of casting this 9th level spell was found in ${city.name} ` +
                    `(rolled ${availabilityCheck.roll}/100).`;
  }

  res.json({
    available: true,
    city,
    spell_name: spell_name.trim(),
    spell_level,
    caster_level,
    cost,
    service: serviceRecord,
    formula: spell_level === 0
      ? `${caster_level} × 5 gp (min 10 gp)`
      : `${spell_level} × ${caster_level} × 10 gp`,
    availability_check: availabilityCheck,
    message: successMessage
  });
};

/**
 * Get all spellcasting services
 */
const getAllServices = async (req, res) => {
  const { city_id, character_id, limit } = req.query;

  const options = {};
  if (city_id) options.city_id = parseInt(city_id);
  if (character_id) options.character_id = parseInt(character_id);
  if (limit) options.limit = parseInt(limit);

  const services = await SpellcastingService.getAll(options);
  res.json(services);
};

/**
 * Get spellcasting service by ID
 */
const getServiceById = async (req, res) => {
  const { id } = req.params;
  const service = await SpellcastingService.findById(id);

  if (!service) {
    throw controllerFactory.createNotFoundError('Service record not found');
  }

  res.json(service);
};

/**
 * Delete a spellcasting service record
 */
const deleteService = async (req, res) => {
  const { id } = req.params;

  const service = await SpellcastingService.findById(id);
  if (!service) {
    throw controllerFactory.createNotFoundError('Service record not found');
  }

  await SpellcastingService.delete(id);
  logger.info(`Spellcasting service deleted: ID ${id}`);
  res.json({ message: 'Service record deleted successfully' });
};

/**
 * Get available spells
 */
const getAvailableSpells = async (req, res) => {
  const { search, max_level } = req.query;

  let query = 'SELECT id, name, spelllevel, school, class FROM spells WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (search && search.trim()) {
    query += ` AND LOWER(name) LIKE LOWER($${paramIndex++})`;
    params.push(`%${search.trim()}%`);
  }

  if (max_level !== undefined) {
    query += ` AND spelllevel <= $${paramIndex++}`;
    params.push(parseInt(max_level));
  }

  query += ' ORDER BY name LIMIT 50';

  const result = await dbUtils.executeQuery(query, params);
  res.json(result.rows);
};

// Export wrapped controllers
exports.checkSpellcastingService = controllerFactory.createHandler(checkSpellcastingService, {
  errorMessage: 'Error checking spellcasting service'
});

exports.getAllServices = controllerFactory.createHandler(getAllServices, {
  errorMessage: 'Error fetching spellcasting services'
});

exports.getServiceById = controllerFactory.createHandler(getServiceById, {
  errorMessage: 'Error fetching spellcasting service'
});

exports.deleteService = controllerFactory.createHandler(deleteService, {
  errorMessage: 'Error deleting spellcasting service'
});

exports.getAvailableSpells = controllerFactory.createHandler(getAvailableSpells, {
  errorMessage: 'Error fetching available spells'
});
