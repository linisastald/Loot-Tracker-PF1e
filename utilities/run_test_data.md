# Test Data Generation Instructions

This directory contains a script to generate test data for your test.kempsonandko.com instance.

## What the script creates:

- **4 test player users** (testplayer1-4 with passwords that need to be hashed)
- **4 characters** (one per user): Captain Blackwater, Quartermaster Swift, Navigator Reef, Gunner Ironbeard
- **5 ships** with various statuses and damage levels
- **4 outposts** in different locations
- **14 crew members** assigned to ships and outposts (includes some deceased/departed for realism)
- **~50 loot entries** with variety of items, statuses, and dates spanning recent months
- **~40 gold transactions** including party payments, purchases, and withdrawals

## Before running the script:

⚠️ **IMPORTANT**: The script includes placeholder password hashes. You need to update these with real bcrypt hashes.

### Option 1: Generate password hashes
Use Node.js to generate proper hashes:
```javascript
const bcrypt = require('bcrypt');
const password = 'testpass123'; // Use a secure test password
const hash = bcrypt.hashSync(password, 10);
console.log(hash);
```

### Option 2: Use the same hash as your existing DM user
Query your existing DM user's password hash and use that for consistency:
```sql
SELECT password FROM users WHERE role = 'dm' LIMIT 1;
```

## To run the script:

1. **Backup your test database first** (just in case)
2. Replace the placeholder password hashes in `generate_test_data.sql`
3. Run the script against your test database:
   ```bash
   psql -h your-host -d your-database -U your-user -f generate_test_data.sql
   ```

## Test scenarios this enables:

- **Loot management**: Mix of processed/unprocessed items with different statuses
- **User roles**: Test player vs DM functionality
- **Item identification**: Some unidentified items to test the identify workflow
- **Gold tracking**: Various transaction types and character-specific balances
- **Ship management**: Multiple ships with different conditions
- **Crew management**: Crew assigned to different locations, some with departure/death dates
- **Historical data**: Transactions and loot spanning several months for reporting

## Test user credentials:
- Username: `testplayer1` / Email: `player1@test.com`
- Username: `testplayer2` / Email: `player2@test.com`  
- Username: `testplayer3` / Email: `player3@test.com`
- Username: `testplayer4` / Email: `player4@test.com`
- Password: Whatever you set when generating the hashes

## Notes:
- All dates are from 2024 (May-August) to look recent
- Item and mod IDs reference your existing populated tables
- Loot entries include a good mix of statuses: Unprocessed, Kept Self, Kept Party, Sold, Trash
- Gold transactions show realistic party loot distribution patterns
- Ships and crew have Skulls & Shackles pirate theme appropriate for the campaign