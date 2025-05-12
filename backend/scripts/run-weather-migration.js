const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

const runMigration = async () => {
    try {
        console.log('Reading weather migration file...');
        const migrationPath = path.join(__dirname, '../migrations/weather_system.sql');
        const migration = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('Running weather migration...');
        await pool.query(migration);
        
        console.log('Weather migration completed successfully!');
        
        // Close the pool
        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('Error running migration:', error);
        process.exit(1);
    }
};

runMigration();
