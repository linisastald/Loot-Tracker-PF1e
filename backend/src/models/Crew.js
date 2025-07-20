// src/models/Crew.js
const BaseModel = require('./BaseModel');

class Crew extends BaseModel {
  constructor() {
    super({
      tableName: 'crew',
      primaryKey: 'id',
      fields: ['name', 'race', 'age', 'description', 'location_type', 'location_id', 'ship_position', 'is_alive', 'death_date', 'departure_date', 'departure_reason'],
      timestamps: { createdAt: true, updatedAt: true }
    });
  }

  /**
   * Get all living crew with location details
   * @return {Promise<Array>} Array of crew with location names
   */
  async getAllWithLocation() {
    const query = `
      SELECT c.*, 
             CASE 
               WHEN c.location_type = 'ship' THEN s.name
               WHEN c.location_type = 'outpost' THEN o.name
               ELSE NULL
             END as location_name
      FROM crew c
      LEFT JOIN ships s ON c.location_type = 'ship' AND c.location_id = s.id
      LEFT JOIN outposts o ON c.location_type = 'outpost' AND c.location_id = o.id
      WHERE c.is_alive = true
      ORDER BY c.name
    `;
    const result = await this.query(query);
    return result.rows;
  }

  /**
   * Get crew by location
   * @param {string} locationType - 'ship' or 'outpost'
   * @param {number} locationId 
   * @return {Promise<Array>} Array of crew at location
   */
  async getByLocation(locationType, locationId) {
    const query = `
      SELECT * FROM crew 
      WHERE location_type = $1 AND location_id = $2 AND is_alive = true
      ORDER BY 
        CASE 
          WHEN $1 = 'ship' AND ship_position = 'captain' THEN 1
          WHEN $1 = 'ship' AND ship_position = 'first mate' THEN 2
          WHEN $1 = 'ship' THEN 3
          ELSE 4
        END,
        name
    `;
    const result = await this.query(query, [locationType, locationId]);
    return result.rows;
  }

  /**
   * Mark crew member as dead
   * @param {number} crewId 
   * @param {Date} deathDate 
   * @return {Promise<Object|null>} Updated crew record
   */
  async markDead(crewId, deathDate = new Date()) {
    return await this.update(crewId, {
      is_alive: false,
      death_date: deathDate
    });
  }

  /**
   * Mark crew member as departed
   * @param {number} crewId 
   * @param {Date} departureDate 
   * @param {string} reason 
   * @return {Promise<Object|null>} Updated crew record
   */
  async markDeparted(crewId, departureDate = new Date(), reason = null) {
    return await this.update(crewId, {
      is_alive: false,
      departure_date: departureDate,
      departure_reason: reason
    });
  }

  /**
   * Move crew to new location
   * @param {number} crewId 
   * @param {string} newLocationType 
   * @param {number} newLocationId 
   * @param {string} newPosition - Only for ships
   * @return {Promise<Object|null>} Updated crew record
   */
  async moveToLocation(crewId, newLocationType, newLocationId, newPosition = null) {
    const updateData = {
      location_type: newLocationType,
      location_id: newLocationId
    };

    if (newLocationType === 'ship') {
      updateData.ship_position = newPosition;
    } else {
      updateData.ship_position = null;
    }

    return await this.update(crewId, updateData);
  }

  /**
   * Get deceased/departed crew
   * @return {Promise<Array>} Array of non-living crew
   */
  async getDeceased() {
    const query = `
      SELECT c.*, 
             CASE 
               WHEN c.location_type = 'ship' THEN s.name
               WHEN c.location_type = 'outpost' THEN o.name
               ELSE NULL
             END as last_known_location
      FROM crew c
      LEFT JOIN ships s ON c.location_type = 'ship' AND c.location_id = s.id
      LEFT JOIN outposts o ON c.location_type = 'outpost' AND c.location_id = o.id
      WHERE c.is_alive = false
      ORDER BY 
        COALESCE(c.death_date, c.departure_date) DESC,
        c.name
    `;
    const result = await this.query(query);
    return result.rows;
  }
}

module.exports = Crew;
