/**
 * Test setup script for backend
 * Prepares test database and runs initial setup
 */

const TestDatabase = require('../tests/testDatabase');
const { Pool } = require('pg');

async function setupTestEnvironment() {
  console.log('🔧 Setting up test environment...');
  
  try {
    // Ensure test environment variables are set
    if (!process.env.TEST_DB_NAME) {
      process.env.TEST_DB_NAME = 'pathfinder_loot_test';
    }
    
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'test';
    }

    // Set other required test environment variables
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
    
    console.log('✓ Environment variables configured');

    // Setup test database
    const testDb = new TestDatabase();
    await testDb.setup();
    
    console.log('✅ Test environment setup complete!');
    console.log(`📊 Test database: ${process.env.TEST_DB_NAME}`);
    console.log('🚀 Ready to run tests');
    
  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
    process.exit(1);
  }
}

async function teardownTestEnvironment() {
  console.log('🧹 Tearing down test environment...');
  
  try {
    const testDb = new TestDatabase();
    await testDb.teardown();
    
    console.log('✅ Test environment teardown complete!');
  } catch (error) {
    console.error('❌ Test teardown failed:', error.message);
    process.exit(1);
  }
}

// Run setup or teardown based on command line argument
const command = process.argv[2];

if (command === 'setup') {
  setupTestEnvironment();
} else if (command === 'teardown') {
  teardownTestEnvironment();
} else {
  console.log('Usage: node test-setup.js [setup|teardown]');
  process.exit(1);
}