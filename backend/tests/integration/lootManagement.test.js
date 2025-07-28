/**
 * Integration tests for loot management workflows
 * Tests complete user workflows from authentication to loot operations
 */

const request = require('supertest');
const express = require('express');
const { ApiTestHelpers, DatabaseTestHelpers, MockDataGenerators, TestAssertions } = require('../utils/testHelpers');

// Import actual routes and controllers
const authRoutes = require('../../src/api/routes/auth');
const lootRoutes = require('../../src/api/routes/loot');
const itemRoutes = require('../../src/api/routes/items');

// Mock external dependencies
jest.mock('../../src/services/itemParsingService', () => ({
  parseItemWithGPT: jest.fn().mockResolvedValue({
    success: true,
    itemId: 1,
    modIds: [1, 2],
    itemName: 'Parsed Item Name'
  })
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

describe('Loot Management Integration Tests', () => {
  let app;
  let apiHelpers;
  let dbHelpers;
  let testUser;
  let testCharacter;
  let authToken;

  beforeAll(async () => {
    // Create Express app with all necessary routes
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/loot', lootRoutes);
    app.use('/api/items', itemRoutes);
    
    apiHelpers = new ApiTestHelpers(app);
    dbHelpers = new DatabaseTestHelpers(global.testUtils.pool);
  });

  beforeEach(async () => {
    // Create test user and character for each test
    testUser = await dbHelpers.insertUser({
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      role: 'player'
    });
    
    testCharacter = await dbHelpers.insertCharacter(testUser.id, {
      name: 'Test Character',
      class: 'Fighter',
      level: 5
    });

    authToken = apiHelpers.createAuthHeader(testUser.id, testUser.role);
  });

  describe('Complete Loot Entry Workflow', () => {
    it('should allow user to add, identify, and manage loot item', async () => {
      // Step 1: Add unidentified loot item
      const lootData = {
        name: 'Unknown Magic Item',
        description: 'A mysterious glowing sword',
        value: null,
        quantity: 1,
        unidentified: true,
        character_id: testCharacter.id
      };

      const addResponse = await request(app)
        .post('/api/loot')
        .set('Authorization', authToken)
        .send(lootData);

      TestAssertions.expectSuccessResponse(addResponse, 201);
      expect(addResponse.body.data).toHaveProperty('id');
      const lootId = addResponse.body.data.id;

      // Step 2: Get loot items to verify addition
      const getResponse = await request(app)
        .get('/api/loot')
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(getResponse);
      const lootItems = getResponse.body.data;
      const addedItem = lootItems.find(item => item.id === lootId);
      expect(addedItem).toBeDefined();
      expect(addedItem.unidentified).toBe(true);

      // Step 3: Identify the item (link to database item)
      const identifyData = {
        itemid: 1, // Assuming item ID 1 exists in test database
        unidentified: false,
        name: 'Long Sword +1'
      };

      const identifyResponse = await request(app)
        .put(`/api/loot/${lootId}`)
        .set('Authorization', authToken)
        .send(identifyData);

      TestAssertions.expectSuccessResponse(identifyResponse);

      // Step 4: Verify identification
      const verifyResponse = await request(app)
        .get(`/api/loot/${lootId}`)
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(verifyResponse);
      expect(verifyResponse.body.data.unidentified).toBe(false);
      expect(verifyResponse.body.data.itemid).toBe(1);

      // Step 5: Update item status to "Pending Sale"
      const sellData = {
        status: 'Pending Sale',
        sale_value: 750
      };

      const sellResponse = await request(app)
        .put(`/api/loot/${lootId}`)
        .set('Authorization', authToken)
        .send(sellData);

      TestAssertions.expectSuccessResponse(sellResponse);

      // Step 6: Complete the sale
      const completeSaleData = {
        status: 'Sold',
        sold_date: new Date().toISOString(),
        actual_sale_value: 700
      };

      const completeSaleResponse = await request(app)
        .put(`/api/loot/${lootId}`)
        .set('Authorization', authToken)
        .send(completeSaleData);

      TestAssertions.expectSuccessResponse(completeSaleResponse);

      // Final verification
      const finalResponse = await request(app)
        .get(`/api/loot/${lootId}`)
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(finalResponse);
      const finalItem = finalResponse.body.data;
      expect(finalItem.status).toBe('Sold');
      expect(finalItem.actual_sale_value).toBe(700);
      expect(finalItem.sold_date).toBeTruthy();
    });

    it('should handle bulk loot operations', async () => {
      // Add multiple loot items
      const lootItems = MockDataGenerators.generateLootItems(3);
      const lootIds = [];

      for (const lootData of lootItems) {
        const response = await request(app)
          .post('/api/loot')
          .set('Authorization', authToken)
          .send({ ...lootData, character_id: testCharacter.id });

        TestAssertions.expectSuccessResponse(response, 201);
        lootIds.push(response.body.data.id);
      }

      // Bulk update status to "Kept Party"
      const bulkUpdateData = {
        lootIds: lootIds,
        status: 'Kept Party',
        characterId: testCharacter.id
      };

      const bulkResponse = await request(app)
        .put('/api/loot/bulk-update')
        .set('Authorization', authToken)
        .send(bulkUpdateData);

      TestAssertions.expectSuccessResponse(bulkResponse);

      // Verify all items were updated
      for (const lootId of lootIds) {
        const verifyResponse = await request(app)
          .get(`/api/loot/${lootId}`)
          .set('Authorization', authToken);

        TestAssertions.expectSuccessResponse(verifyResponse);
        expect(verifyResponse.body.data.status).toBe('Kept Party');
      }
    });
  });

  describe('Item Splitting Workflow', () => {
    it('should split stackable items correctly', async () => {
      // Add stackable item
      const stackableItem = {
        name: 'Healing Potions',
        description: 'Cure Light Wounds potions',
        value: 50,
        quantity: 10,
        character_id: testCharacter.id
      };

      const addResponse = await request(app)
        .post('/api/loot')
        .set('Authorization', authToken)
        .send(stackableItem);

      TestAssertions.expectSuccessResponse(addResponse, 201);
      const originalId = addResponse.body.data.id;

      // Split the stack
      const splitData = {
        lootId: originalId,
        newQuantities: [
          { quantity: 3 },
          { quantity: 4 },
          { quantity: 3 }
        ]
      };

      const splitResponse = await request(app)
        .post('/api/loot/split-stack')
        .set('Authorization', authToken)
        .send(splitData);

      TestAssertions.expectSuccessResponse(splitResponse);

      // Verify original item was updated and new items created
      const allLootResponse = await request(app)
        .get('/api/loot')
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(allLootResponse);
      
      const healingPotions = allLootResponse.body.data.filter(
        item => item.name === 'Healing Potions'
      );

      expect(healingPotions).toHaveLength(3); // Original + 2 new
      
      const quantities = healingPotions.map(item => item.quantity).sort();
      expect(quantities).toEqual([3, 3, 4]);
    });

    it('should reject invalid split quantities', async () => {
      // Add item
      const item = {
        name: 'Test Item',
        quantity: 5,
        character_id: testCharacter.id
      };

      const addResponse = await request(app)
        .post('/api/loot')
        .set('Authorization', authToken)
        .send(item);

      TestAssertions.expectSuccessResponse(addResponse, 201);
      const itemId = addResponse.body.data.id;

      // Try to split with quantities that don't match original
      const invalidSplitData = {
        lootId: itemId,
        newQuantities: [
          { quantity: 2 },
          { quantity: 2 }
        ] // Total 4, but original is 5
      };

      const splitResponse = await request(app)
        .post('/api/loot/split-stack')
        .set('Authorization', authToken)
        .send(invalidSplitData);

      TestAssertions.expectErrorResponse(splitResponse, 400);
    });
  });

  describe('Item Parsing Integration', () => {
    it('should parse item description and link to database items', async () => {
      const itemData = {
        name: 'Magic Weapon',
        description: '+1 Flaming Long Sword',
        character_id: testCharacter.id,
        unidentified: false
      };

      const response = await request(app)
        .post('/api/loot/parse-and-add')
        .set('Authorization', authToken)
        .send(itemData);

      TestAssertions.expectSuccessResponse(response, 201);
      
      const createdItem = response.body.data;
      expect(createdItem.itemid).toBeTruthy();
      expect(createdItem.modids).toBeTruthy();
      expect(createdItem.name).toBe('Parsed Item Name');
    });
  });

  describe('Loot Filtering and Search', () => {
    beforeEach(async () => {
      // Create diverse loot items for filtering tests
      const testItems = [
        { name: 'Magic Sword', type: 'weapon', status: 'Available', unidentified: false },
        { name: 'Unknown Ring', type: 'ring', status: 'Available', unidentified: true },
        { name: 'Healing Potion', type: 'potion', status: 'Pending Sale', unidentified: false },
        { name: 'Plate Armor', type: 'armor', status: 'Sold', unidentified: false },
        { name: 'Mystery Item', type: 'misc', status: 'Kept Party', unidentified: true }
      ];

      for (const item of testItems) {
        await request(app)
          .post('/api/loot')
          .set('Authorization', authToken)
          .send({ ...item, character_id: testCharacter.id });
      }
    });

    it('should filter loot by status', async () => {
      const response = await request(app)
        .get('/api/loot?status=Pending Sale')
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(response);
      
      const items = response.body.data;
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Healing Potion');
      expect(items[0].status).toBe('Pending Sale');
    });

    it('should filter loot by identification status', async () => {
      const response = await request(app)
        .get('/api/loot?unidentified=true')
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(response);
      
      const items = response.body.data;
      expect(items).toHaveLength(2);
      expect(items.every(item => item.unidentified === true)).toBe(true);
    });

    it('should search loot by name', async () => {
      const response = await request(app)
        .get('/api/loot?search=sword')
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(response);
      
      const items = response.body.data;
      expect(items).toHaveLength(1);
      expect(items[0].name.toLowerCase()).toContain('sword');
    });

    it('should combine multiple filters', async () => {
      const response = await request(app)
        .get('/api/loot?status=Available&unidentified=false')
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(response);
      
      const items = response.body.data;
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Magic Sword');
    });
  });

  describe('Authorization and Security', () => {
    let otherUser;
    let otherCharacter;

    beforeEach(async () => {
      // Create another user to test authorization
      otherUser = await dbHelpers.insertUser({
        username: `otheruser_${Date.now()}`,
        email: `other_${Date.now()}@example.com`
      });
      
      otherCharacter = await dbHelpers.insertCharacter(otherUser.id, {
        name: 'Other Character'
      });
    });

    it('should not allow users to access other users loot', async () => {
      // Add loot as first user
      const lootData = {
        name: 'Private Item',
        character_id: testCharacter.id
      };

      const addResponse = await request(app)
        .post('/api/loot')
        .set('Authorization', authToken)
        .send(lootData);

      TestAssertions.expectSuccessResponse(addResponse, 201);
      const lootId = addResponse.body.data.id;

      // Try to access as second user
      const otherUserToken = apiHelpers.createAuthHeader(otherUser.id);
      const accessResponse = await request(app)
        .get(`/api/loot/${lootId}`)
        .set('Authorization', otherUserToken);

      TestAssertions.expectErrorResponse(accessResponse, 403);
    });

    it('should not allow users to modify other users loot', async () => {
      // Add loot as first user
      const lootData = {
        name: 'Protected Item',
        character_id: testCharacter.id
      };

      const addResponse = await request(app)
        .post('/api/loot')
        .set('Authorization', authToken)
        .send(lootData);

      TestAssertions.expectSuccessResponse(addResponse, 201);
      const lootId = addResponse.body.data.id;

      // Try to modify as second user
      const otherUserToken = apiHelpers.createAuthHeader(otherUser.id);
      const modifyResponse = await request(app)
        .put(`/api/loot/${lootId}`)
        .set('Authorization', otherUserToken)
        .send({ name: 'Hacked Item' });

      TestAssertions.expectErrorResponse(modifyResponse, 403);
    });

    it('should require authentication for all loot operations', async () => {
      const unauthenticatedRequests = [
        request(app).get('/api/loot'),
        request(app).post('/api/loot').send({ name: 'Test' }),
        request(app).put('/api/loot/1').send({ name: 'Test' }),
        request(app).delete('/api/loot/1')
      ];

      for (const req of unauthenticatedRequests) {
        const response = await req;
        TestAssertions.expectUnauthorized(response);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid loot data gracefully', async () => {
      const invalidData = {
        // Missing required fields
        description: 'Invalid item'
      };

      const response = await request(app)
        .post('/api/loot')
        .set('Authorization', authToken)
        .send(invalidData);

      TestAssertions.expectErrorResponse(response, 400);
    });

    it('should handle non-existent loot item requests', async () => {
      const response = await request(app)
        .get('/api/loot/99999')
        .set('Authorization', authToken);

      TestAssertions.expectNotFound(response);
    });

    it('should handle database constraints violations', async () => {
      const invalidCharacterData = {
        name: 'Test Item',
        character_id: 99999, // Non-existent character
        quantity: 1
      };

      const response = await request(app)
        .post('/api/loot')
        .set('Authorization', authToken)
        .send(invalidCharacterData);

      TestAssertions.expectErrorResponse(response, 400, 'Invalid character');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large quantities of loot items', async () => {
      // Add many loot items
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          request(app)
            .post('/api/loot')
            .set('Authorization', authToken)
            .send({
              name: `Test Item ${i}`,
              character_id: testCharacter.id,
              quantity: 1
            })
        );
      }

      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        TestAssertions.expectSuccessResponse(response, 201);
      });

      // Verify retrieval is still performant
      const start = Date.now();
      const getResponse = await request(app)
        .get('/api/loot')
        .set('Authorization', authToken);
      const duration = Date.now() - start;

      TestAssertions.expectSuccessResponse(getResponse);
      expect(getResponse.body.data).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Comprehensive Identify Workflow', () => {
    let testItem;
    let unidentifiedLootId;

    beforeEach(async () => {
      // Setup: Ensure we have a base item with spellcraft DC in test database
      await dbHelpers.insertItem({
        id: 999,
        name: 'Magical Test Sword',
        type: 'weapon',
        casterlevel: 5,
        description: 'A sword with magical properties'
      });
      
      testItem = { id: 999, name: 'Magical Test Sword', casterlevel: 5 };
    });

    it('should complete full user identification workflow with DC checks and day restrictions', async () => {
      // Step 1: User adds unidentified loot item
      const unidentifiedLootData = {
        name: 'Unknown Magical Sword',
        description: 'A mysterious glowing weapon',
        character_id: testCharacter.id,
        unidentified: true,
        quantity: 1
      };

      const addLootResponse = await request(app)
        .post('/api/loot')
        .set('Authorization', authToken)
        .send(unidentifiedLootData);

      TestAssertions.expectSuccessResponse(addLootResponse, 201);
      unidentifiedLootId = addLootResponse.body.data.id;

      // Step 2: User verifies item appears in loot list
      const lootListResponse = await request(app)
        .get('/api/loot')
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(lootListResponse);
      const lootItems = lootListResponse.body.data;
      const addedItem = lootItems.find(item => item.id === unidentifiedLootId);
      
      expect(addedItem).toBeDefined();
      expect(addedItem.unidentified).toBe(true);
      expect(addedItem.name).toBe('Unknown Magical Sword');

      // Step 3: DM updates itemid to link to an item with spellcraft DC
      const dmUpdateData = {
        itemid: testItem.id,
        unidentified: true // Still unidentified, just linked
      };

      const dmUpdateResponse = await request(app)
        .put(`/api/loot/${unidentifiedLootId}`)
        .set('Authorization', authToken)
        .send(dmUpdateData);

      TestAssertions.expectSuccessResponse(dmUpdateResponse);

      // Step 4: User verifies item appears in identify list (unidentified items with itemid)
      const unidentifiedResponse = await request(app)
        .get('/api/loot/unidentified')
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(unidentifiedResponse);
      const unidentifiedItems = unidentifiedResponse.body.data;
      const identifiableItem = unidentifiedItems.find(item => item.id === unidentifiedLootId);
      
      expect(identifiableItem).toBeDefined();
      expect(identifiableItem.itemid).toBe(testItem.id);
      expect(identifiableItem.unidentified).toBe(true);

      // Step 5: User attempts identification with roll LESS than spellcraft DC
      // Spellcraft DC = 15 + caster level (5) = 20
      // User rolls 10 + bonuses, total = 15 (less than DC 20)
      const lowRollAttempt = {
        items: [{
          lootId: unidentifiedLootId,
          itemId: testItem.id
        }],
        characterId: testCharacter.id,
        spellcraftRolls: [15] // Less than DC 20
      };

      const lowRollResponse = await request(app)
        .post('/api/loot/identify')
        .set('Authorization', authToken)
        .send(lowRollAttempt);

      TestAssertions.expectSuccessResponse(lowRollResponse);
      expect(lowRollResponse.body.data.count.failed).toBe(1);
      expect(lowRollResponse.body.data.count.success).toBe(0);

      // Verify item is still unidentified
      const stillUnidentifiedResponse = await request(app)
        .get(`/api/loot/${unidentifiedLootId}`)
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(stillUnidentifiedResponse);
      expect(stillUnidentifiedResponse.body.data.unidentified).toBe(true);

      // Step 6: User attempts identification again on same Golarion day (should be blocked)
      const sameayAttempt = {
        items: [{
          lootId: unidentifiedLootId,
          itemId: testItem.id
        }],
        characterId: testCharacter.id,
        spellcraftRolls: [25] // Higher roll this time
      };

      const sameDayResponse = await request(app)
        .post('/api/loot/identify')
        .set('Authorization', authToken)
        .send(sameayAttempt);

      TestAssertions.expectSuccessResponse(sameDayResponse);
      expect(sameDayResponse.body.data.count.alreadyAttempted).toBe(1);
      expect(sameDayResponse.body.data.count.success).toBe(0);

      // Verify item is still unidentified
      const stillUnidentified2Response = await request(app)
        .get(`/api/loot/${unidentifiedLootId}`)
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(stillUnidentified2Response);
      expect(stillUnidentified2Response.body.data.unidentified).toBe(true);

      // Step 7: Simulate next Golarion day and successful identification
      // First, advance the Golarion date
      await dbHelpers.executeQuery(`
        UPDATE golarion_current_date 
        SET day = day + 1 
        WHERE id = (SELECT id FROM golarion_current_date LIMIT 1)
      `);

      // Now attempt identification with successful roll
      const successfulAttempt = {
        items: [{
          lootId: unidentifiedLootId,
          itemId: testItem.id
        }],
        characterId: testCharacter.id,
        spellcraftRolls: [25] // Greater than DC 20
      };

      const successResponse = await request(app)
        .post('/api/loot/identify')
        .set('Authorization', authToken)
        .send(successfulAttempt);

      TestAssertions.expectSuccessResponse(successResponse);
      expect(successResponse.body.data.count.success).toBe(1);
      expect(successResponse.body.data.count.failed).toBe(0);

      // Step 8: Verify item is now identified
      const identifiedResponse = await request(app)
        .get(`/api/loot/${unidentifiedLootId}`)
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(identifiedResponse);
      expect(identifiedResponse.body.data.unidentified).toBe(false);
      expect(identifiedResponse.body.data.itemid).toBe(testItem.id);

      // Step 9: Verify item no longer appears in unidentified list
      const finalUnidentifiedResponse = await request(app)
        .get('/api/loot/unidentified')
        .set('Authorization', authToken);

      TestAssertions.expectSuccessResponse(finalUnidentifiedResponse);
      const finalUnidentifiedItems = finalUnidentifiedResponse.body.data;
      const shouldNotExist = finalUnidentifiedItems.find(item => item.id === unidentifiedLootId);
      
      expect(shouldNotExist).toBeUndefined();
    });

    it('should handle identification attempts with multiple items', async () => {
      // Create multiple unidentified items
      const items = [];
      for (let i = 0; i < 3; i++) {
        const lootData = {
          name: `Unknown Item ${i + 1}`,
          character_id: testCharacter.id,
          unidentified: true,
          itemid: testItem.id
        };

        const response = await request(app)
          .post('/api/loot')
          .set('Authorization', authToken)
          .send(lootData);

        TestAssertions.expectSuccessResponse(response, 201);
        items.push({
          lootId: response.body.data.id,
          itemId: testItem.id
        });
      }

      // Attempt to identify all items with mixed results
      const mixedAttempt = {
        items: items,
        characterId: testCharacter.id,
        spellcraftRolls: [15, 25, 30] // One failure, two successes
      };

      const mixedResponse = await request(app)
        .post('/api/loot/identify')
        .set('Authorization', authToken)
        .send(mixedAttempt);

      TestAssertions.expectSuccessResponse(mixedResponse);
      expect(mixedResponse.body.data.count.success).toBe(2);
      expect(mixedResponse.body.data.count.failed).toBe(1);

      // Verify results
      for (let i = 0; i < items.length; i++) {
        const itemResponse = await request(app)
          .get(`/api/loot/${items[i].lootId}`)
          .set('Authorization', authToken);

        TestAssertions.expectSuccessResponse(itemResponse);
        
        if (i === 0) {
          // First item should still be unidentified (roll was 15 < DC 20)
          expect(itemResponse.body.data.unidentified).toBe(true);
        } else {
          // Other items should be identified (rolls were 25, 30 > DC 20)
          expect(itemResponse.body.data.unidentified).toBe(false);
        }
      }
    });
  });
});