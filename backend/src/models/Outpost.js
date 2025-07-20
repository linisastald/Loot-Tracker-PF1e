// src/models/Outpost.js
const BaseModel = require('./BaseModel');

class Outpost extends BaseModel {
  constructor() {
    super({
      tableName: 'outposts',
      primaryKey: 'id',
      fields: ['name', 'location', 'access_date'],
      timestamps: { createdAt: true, updatedAt: true }
    });
  }

  /**
   * Get all outposts with their crew count
   * @return {Promise<Array>} Array of outposts with crew counts
   */
  async getAllWithCrewCount() {
    const query = `
      SELECT o.*, 
             COUNT(CASE WHEN c.location_type = 'outpost' AND c.is_alive = true THEN 1 END) as crew_count
      FROM outposts o
      LEFT JOIN crew c ON c.location_id = o.id AND c.location_type = 'outpost'
      GROUP BY o.id
      ORDER BY o.name
    `;
    const result = await this.query(query);
    return result.rows;
  }

  /**
   * Get outpost with its crew
   * @param {number} outpostId 
   * @return {Promise<Object|null>} Outpost with crew array
   */
  async getWithCrew(outpostId) {
    const outpost = await this.findById(outpostId);
    if (!outpost) return null;

    const crewQuery = `
      SELECT * FROM crew 
      WHERE location_type = 'outpost' AND location_id = $1 AND is_alive = true
      ORDER BY name
    `;
    const crewResult = await this.query(crewQuery, [outpostId]);
    
    return {
      ...outpost,
      crew: crewResult.rows
    };
  }
}

module.exports = Outpost;
