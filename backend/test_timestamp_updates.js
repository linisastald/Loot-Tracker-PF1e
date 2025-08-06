/**
 * Test script to verify timestamp column renames work correctly
 * Run this after applying the migration to test the changes
 */

const { Pool } = require('pg');

// Test configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'loot_tracking',
  user: process.env.DB_USER || 'loot_user',
  password: process.env.DB_PASSWORD
});

async function testTimestampColumns() {
  const client = await pool.connect();
  
  try {
    console.log('Testing timestamp column renames...\n');

    // Test 1: Verify consumableuse table structure
    console.log('1. Testing consumableuse table...');
    const consumableColumns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'consumableuse' 
        AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);
    
    const hasConsumedOn = consumableColumns.rows.some(col => col.column_name === 'consumed_on');
    const hasTime = consumableColumns.rows.some(col => col.column_name === 'time');
    
    console.log(`   ✓ Has 'consumed_on' column: ${hasConsumedOn}`);
    console.log(`   ✓ Old 'time' column removed: ${!hasTime}`);
    
    if (!hasConsumedOn || hasTime) {
      console.log('   ❌ consumableuse table structure incorrect');
      return false;
    }

    // Test 2: Verify appraisal table structure  
    console.log('\n2. Testing appraisal table...');
    const appraisalColumns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'appraisal' 
        AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);
    
    const hasAppraisedOn = appraisalColumns.rows.some(col => col.column_name === 'appraised_on');
    const hasAppraisalTime = appraisalColumns.rows.some(col => col.column_name === 'time');
    
    console.log(`   ✓ Has 'appraised_on' column: ${hasAppraisedOn}`);
    console.log(`   ✓ Old 'time' column removed: ${!hasAppraisalTime}`);
    
    if (!hasAppraisedOn || hasAppraisalTime) {
      console.log('   ❌ appraisal table structure incorrect');
      return false;
    }

    // Test 3: Verify indexes were updated
    console.log('\n3. Testing indexes...');
    const indexes = await client.query(`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND (indexname LIKE '%time%' OR indexname LIKE '%consumed_on%' OR indexname LIKE '%appraised_on%')
      ORDER BY tablename, indexname;
    `);
    
    const hasOldTimeIndexes = indexes.rows.some(idx => 
      idx.indexname.includes('time') && !idx.indexname.includes('consumed_on') && !idx.indexname.includes('appraised_on')
    );
    const hasNewIndexes = indexes.rows.some(idx => 
      idx.indexname.includes('consumed_on') || idx.indexname.includes('appraised_on')
    );
    
    console.log(`   ✓ Old time indexes removed: ${!hasOldTimeIndexes}`);
    console.log(`   ✓ New timestamp indexes created: ${hasNewIndexes}`);
    
    if (hasOldTimeIndexes) {
      console.log('   ❌ Old time indexes still exist');
      return false;
    }

    // Test 4: Test basic INSERT operations work with new column names
    console.log('\n4. Testing INSERT operations...');
    
    // Test consumableuse insert (requires existing loot and character)
    const testLoot = await client.query('SELECT id FROM loot LIMIT 1');
    const testCharacter = await client.query('SELECT id FROM characters LIMIT 1');
    
    if (testLoot.rows.length > 0 && testCharacter.rows.length > 0) {
      const insertResult = await client.query(`
        INSERT INTO consumableuse (lootid, who, consumed_on) 
        VALUES ($1, $2, CURRENT_TIMESTAMP) 
        RETURNING id, consumed_on
      `, [testLoot.rows[0].id, testCharacter.rows[0].id]);
      
      console.log(`   ✓ consumableuse INSERT successful: Record ${insertResult.rows[0].id} created`);
      
      // Clean up test record
      await client.query('DELETE FROM consumableuse WHERE id = $1', [insertResult.rows[0].id]);
    } else {
      console.log('   ⚠ Skipping consumableuse INSERT test (no test data available)');
    }

    console.log('\n✅ All timestamp column tests passed!');
    return true;

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    return false;
  } finally {
    client.release();
  }
}

// Run the test
testTimestampColumns()
  .then((success) => {
    if (success) {
      console.log('\n🎉 Timestamp column standardization completed successfully!');
      process.exit(0);
    } else {
      console.log('\n💥 Timestamp column standardization failed!');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Test script error:', error);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });