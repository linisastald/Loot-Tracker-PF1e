// src/models/Ship.js
const BaseModel = require('./BaseModel');

class Ship extends BaseModel {
  constructor() {
    super({
      tableName: 'ships',
      primaryKey: 'id',
      fields: ['name', 'location', 'is_squibbing', 'damage'],
      timestamps: { createdAt: true, updatedAt: true }
    });
  }

  /**
   * Get all ships with their crew count
   * @return {Promise<Array>} Array of ships with crew counts
   */
  async getAllWithCrewCount() {
    const query = `
      SELECT s.*, 
             COUNT(CASE WHEN c.location_type = 'ship' AND c.is_alive = true THEN 1 END) as crew_count
      FROM ships s
      LEFT JOIN crew c ON c.location_id = s.id AND c.location_type = 'ship'
      GROUP BY s.id
      ORDER BY s.name
    `;
    const result = await this.query(query);
    return result.rows;
  }

  /**
   * Get ship with its crew
   * @param {number} shipId 
   * @return {Promise<Object|null>} Ship with crew array
   */
  async getWithCrew(shipId) {
    const ship = await this.findById(shipId);
    if (!ship) return null;

    const crewQuery = `
      SELECT * FROM crew 
      WHERE location_type = 'ship' AND location_id = $1 AND is_alive = true
      ORDER BY 
        CASE ship_position 
          WHEN 'captain' THEN 1
          WHEN 'first mate' THEN 2
          ELSE 3
        END,
        name
    `;
    const crewResult = await this.query(crewQuery, [shipId]);
    
    return {
      ...ship,
      crew: crewResult.rows
    };
  }
}

module.exports = Ship;
