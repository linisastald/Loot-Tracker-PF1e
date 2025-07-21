// scripts/run-migration.js
const migrationRunner = require('../src/utils/migrationRunner');
const logger = require('../src/utils/logger');

const runMigrations = async () => {
    try {
        console.log('Starting manual migration run...');
        await migrationRunner.runMigrations();
        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        logger.error('Manual migration failed:', error);
        process.exit(1);
    }
};

runMigrations();
