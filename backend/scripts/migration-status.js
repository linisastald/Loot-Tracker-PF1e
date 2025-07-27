// scripts/migration-status.js
// Standalone script to check migration status without starting the full server

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

const pool = new Pool({
  user: process.env.PGUSER || 'pathfinder',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'pathfinder',
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT || 5432,
});

async function checkMigrationStatus() {
  console.log('🔍 Checking migration status...\n');
  
  try {
    // Check if schema_migrations table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'schema_migrations'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ schema_migrations table does not exist');
      console.log('   This usually means no migrations have been run yet');
      console.log('   Start the server to initialize migrations');
      return;
    }
    
    // Get applied migrations
    const appliedResult = await pool.query('SELECT filename, applied_at FROM schema_migrations ORDER BY applied_at');
    const appliedMigrations = appliedResult.rows;
    
    // Get available migration files
    const migrationDir = path.join(__dirname, '../backend/migrations');
    const availableFiles = fs.readdirSync(migrationDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    console.log('📊 Migration Status:');
    console.log('==================');
    console.log(`Total available migrations: ${availableFiles.length}`);
    console.log(`Applied migrations: ${appliedMigrations.length}`);
    
    const appliedFilenames = appliedMigrations.map(m => m.filename);
    const pendingMigrations = availableFiles.filter(file => !appliedFilenames.includes(file));
    
    console.log(`Pending migrations: ${pendingMigrations.length}\n`);
    
    if (appliedMigrations.length > 0) {
      console.log('✅ Applied Migrations:');
      appliedMigrations.forEach(migration => {
        console.log(`   ${migration.filename} (${migration.applied_at})`);
      });
      console.log('');
    }
    
    if (pendingMigrations.length > 0) {
      console.log('⏳ Pending Migrations:');
      pendingMigrations.forEach(file => {
        console.log(`   ${file}`);
      });
      console.log('');
      console.log('💡 Run the server to apply pending migrations automatically');
    } else {
      console.log('✅ All migrations are up to date!');
    }
    
    // Check for any orphaned applied migrations (files that no longer exist)
    const orphanedMigrations = appliedFilenames.filter(file => !availableFiles.includes(file));
    if (orphanedMigrations.length > 0) {
      console.log('\n⚠️  Orphaned Migration Records:');
      orphanedMigrations.forEach(file => {
        console.log(`   ${file} (file no longer exists)`);
      });
      console.log('   Consider cleaning up these records manually');
    }
    
  } catch (error) {
    console.error('❌ Error checking migration status:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Database connection refused. Make sure:');
      console.log('   - Database is running');
      console.log('   - Environment variables are set correctly');
      console.log('   - Network connectivity is available');
    }
  } finally {
    await pool.end();
  }
}

// Run the status check
checkMigrationStatus().catch(console.error);
