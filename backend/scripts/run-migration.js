// scripts/run-migration.js
// Enhanced Migration Runner v2.0 Script
const migrationRunner = require('../src/utils/migrationRunner');
const logger = require('../src/utils/logger');

const runMigrations = async () => {
    try {
        console.log('='.repeat(80));
        console.log('Enhanced Migration System v2.0 - Manual Execution');
        console.log('='.repeat(80));

        // Initialize the migration system first
        console.log('Initializing migration system...');
        await migrationRunner.initMigrationSystem();
        console.log('✓ Migration system initialized');

        // Get current status
        console.log('\nChecking migration status...');
        const status = await migrationRunner.getMigrationStatus();

        console.log(`Database Type: ${status.isProductionDatabase ? 'Production' : 'Development'}`);
        console.log(`Migration System Version: ${status.migrationSystemVersion}`);
        console.log(`Total Migrations: ${status.total}`);
        console.log(`Applied Migrations: ${status.applied}`);
        console.log(`Pending Migrations: ${status.pending.length}`);

        if (status.pending.length > 0) {
            console.log('\nPending migrations:');
            status.pending.forEach((migration, index) => {
                console.log(`  ${index + 1}. ${migration}`);
            });
        }

        // Run migrations
        console.log('\nExecuting migrations...');
        await migrationRunner.runMigrations();

        // Get final status
        const finalStatus = await migrationRunner.getMigrationStatus();

        console.log('\n' + '='.repeat(80));
        console.log('Migration Execution Complete');
        console.log('='.repeat(80));
        console.log(`✓ Total Migrations: ${finalStatus.total}`);
        console.log(`✓ Applied Migrations: ${finalStatus.applied}`);
        console.log(`✓ Pending Migrations: ${finalStatus.pending.length}`);

        if (finalStatus.pending.length === 0) {
            console.log('✓ Database is up to date!');
        } else {
            console.log('⚠ Some migrations are still pending');
        }

        process.exit(0);
    } catch (error) {
        console.error('\n' + '='.repeat(80));
        console.error('Migration Failed');
        console.error('='.repeat(80));
        console.error('Error:', error.message);

        if (error.detail) {
            console.error('Detail:', error.detail);
        }

        if (error.hint) {
            console.error('Hint:', error.hint);
        }

        console.error('\nRecovery suggestions:');
        console.error('1. Check the migration SQL for syntax errors');
        console.error('2. Verify database constraints and table structure');
        console.error('3. Check generated rollback templates in migrations/rollbacks/');
        console.error('4. Use the API endpoints for more detailed diagnostics:');
        console.error('   - GET /api/migrations/status');
        console.error('   - GET /api/migrations/history');
        console.error('   - GET /api/migrations/validate');

        logger.error('Manual migration failed:', error);
        process.exit(1);
    }
};

console.log('Starting Enhanced Migration System v2.0...\n');
runMigrations();
