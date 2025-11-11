# Frontend API Migration Guide

## Overview
This guide maps all legacy `/api/loot` endpoints used in the frontend to their new API counterparts in the refactored backend structure.

## API Endpoint Mappings

### 1. Item Creation & Parsing

| Old Endpoint | New Endpoint | File Locations |
|--------------|--------------|----------------|
| `POST /api/loot/parse-item` | `POST /api/item-creation/parse` | `utils/lootEntryUtils.js:138` |
| `POST /api/loot` | `POST /api/item-creation` | `utils/lootEntryUtils.js:151` |

### 2. Item Retrieval & Search

| Old Endpoint | New Endpoint | File Locations |
|--------------|--------------|----------------|
| `GET /api/loot` | `GET /api/items` | `hooks/useLootManagement.js:55` |
| `GET /api/loot/items` | `GET /api/items` | `pages/Identify.js:88`, `pages/ItemManagement/AddItemMod.js:68`, `pages/ItemManagement/GeneralItemManagement.js:55` |
| `GET /api/loot/search` | `GET /api/items/search` | `pages/Infamy.js:275`, `pages/ItemManagement/GeneralItemManagement.js:84` |
| `GET /api/loot/mods` | `GET /api/item-creation/mods` | `pages/ItemManagement/AddItemMod.js:81` |

### 3. Status & Management

| Old Endpoint | New Endpoint | File Locations |
|--------------|--------------|----------------|
| `PUT /api/loot/update-status` | `PATCH /api/items/status` | `utils/utils.js:29,43,57,72` |
| `PUT /api/loot/update-entry/:id` | `PUT /api/items/:id` | `utils/utils.js:144` |
| `PUT /api/loot/dm-update/:id` | `PUT /api/items/:id` | `utils/utils.js:204,308` |
| `POST /api/loot/split-stack` | `POST /api/items/:id/split` | `utils/utils.js:177` |

### 4. Reports & Statistics

| Old Endpoint | New Endpoint | File Locations |
|--------------|--------------|----------------|
| `GET /api/loot/kept-party` | `GET /api/reports/kept/party` | `hooks/useLootManagement.js:58` |
| `GET /api/loot/kept-character` | `GET /api/reports/kept/character` | `hooks/useLootManagement.js:61` |
| `GET /api/loot/trash` | `GET /api/reports/trashed` | `hooks/useLootManagement.js:64` |
| `GET /api/loot/unprocessed-count` | `GET /api/reports/unprocessed/count` | `components/layout/Sidebar.js:84` |
| `GET /api/loot/character-ledger` | `GET /api/reports/ledger` | `pages/GoldTransactions.js:254` |

### 5. Sales Management

| Old Endpoint | New Endpoint | File Locations |
|--------------|--------------|----------------|
| `POST /api/loot/sell-up-to` | `POST /api/sales/up-to` | `pages/ItemManagement/PendingSaleManagement.js:167` |
| `POST /api/loot/sell-all-except` | `POST /api/sales/all-except` | `pages/ItemManagement/PendingSaleManagement.js:194` |
| `POST /api/loot/sell-selected` | `POST /api/sales/selected` | `pages/ItemManagement/PendingSaleManagement.js:239` |

### 6. Appraisal & Identification

| Old Endpoint | New Endpoint | File Locations |
|--------------|--------------|----------------|
| `POST /api/loot/appraise` | `POST /api/appraisal` | `hooks/useLootManagement.js:148` |
| `POST /api/loot/identify` | `POST /api/appraisal/identify` | `pages/Identify.js:175` |

## Migration Steps

### Step 1: Create API Service Wrapper
Create a new service layer that abstracts the API calls, making it easier to switch between old and new endpoints.

```javascript
// services/lootService.js
const USE_NEW_API = process.env.REACT_APP_USE_NEW_API === 'true';

export const lootService = {
  parseItem: (data) => {
    const endpoint = USE_NEW_API ? '/item-creation/parse' : '/loot/parse-item';
    return api.post(endpoint, data);
  },
  // ... other methods
};
```

### Step 2: Update Individual Components
Update each component to use the new service layer instead of direct API calls.

### Step 3: Feature Flag Implementation
Use environment variables to toggle between old and new APIs during migration:
- `REACT_APP_USE_NEW_API=false` - Use legacy endpoints (default)
- `REACT_APP_USE_NEW_API=true` - Use new endpoints

### Step 4: Testing Plan
1. Test each endpoint mapping individually
2. Run full integration tests with new endpoints
3. Implement A/B testing if needed
4. Monitor for any API differences in response formats

## Response Format Differences

Note: The new API uses a standardized response format:
```javascript
{
  success: boolean,
  message: string,
  data: any,
  error?: string
}
```

Legacy endpoints may return data directly without this wrapper.

## Priority Order for Migration

1. **High Priority** (Most used, critical paths):
   - Item retrieval (`GET /api/loot/items`)
   - Status updates (`PUT /api/loot/update-status`)
   - Item creation (`POST /api/loot`)

2. **Medium Priority** (Feature-specific):
   - Appraisal endpoints
   - Sales management
   - Reports

3. **Low Priority** (Less frequently used):
   - Mod retrieval
   - Character ledger
   - Unprocessed count

## Files Requiring Updates

### Core Files (11 files):
1. `frontend/src/utils/lootEntryUtils.js`
2. `frontend/src/utils/utils.js`
3. `frontend/src/hooks/useLootManagement.js`
4. `frontend/src/components/layout/Sidebar.js`
5. `frontend/src/components/pages/Identify.js`
6. `frontend/src/components/pages/GoldTransactions.js`
7. `frontend/src/components/pages/Infamy.js`
8. `frontend/src/components/pages/ItemManagement/AddItemMod.js`
9. `frontend/src/components/pages/ItemManagement/GeneralItemManagement.js`
10. `frontend/src/components/pages/ItemManagement/PendingSaleManagement.js`
11. `frontend/src/components/pages/ItemManagement/UnidentifiedItemsManagement.js`

### Additional Files:
- `frontend/src/components/common/dialogs/ItemManagementDialog.js`

## Testing Checklist

- [ ] Parse item functionality
- [ ] Create new loot items
- [ ] View all loot items
- [ ] Search loot items
- [ ] Update loot status (keep party/self, sell, trash)
- [ ] Split item stacks
- [ ] DM update items
- [ ] View kept party/character items
- [ ] View trashed items
- [ ] Check unprocessed count
- [ ] Character ledger
- [ ] Sales management (sell up to, all except, selected)
- [ ] Appraise items
- [ ] Identify items

## Notes

- The backend maintains backward compatibility through the legacy routes
- Consider implementing a gradual migration using feature flags
- Monitor API usage to ensure smooth transition
- Update error handling to accommodate new response formats
- Consider caching strategies for frequently accessed endpoints