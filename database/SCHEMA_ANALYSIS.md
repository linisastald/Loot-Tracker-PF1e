# Database Schema Column Naming Analysis

**Analysis Date:** August 5, 2025  
**Schema Version:** Current production schema  
**Status:** Documentation Only - No Changes Recommended Due to Production Data Constraints

## Executive Summary

The database schema exhibits significant column naming inconsistencies across 30+ tables that would benefit from standardization. However, per CLAUDE.md guidelines, existing column names must be preserved to maintain compatibility with production data. This analysis documents current inconsistencies and provides guidance for future schema additions.

## Critical Constraints

⚠️ **PRODUCTION DATA COMPATIBILITY REQUIREMENT**  
Per CLAUDE.md: "NEVER change existing database column or table names. The production database has existing data with specific column names that must be preserved."

This means **NO COLUMN RENAMES** can be implemented without substantial risk and downtime.

## Major Inconsistencies Identified

### 1. Foreign Key Column Naming Inconsistencies

| Table | Current Column | References | Should Be | Impact |
|-------|----------------|------------|-----------|---------|
| `loot` | `whohas` | `characters.id` | `character_id` | High - Core functionality |
| `loot` | `itemid` | `item.id` | `item_id` | High - Core functionality |
| `loot` | `modids` | `mod.id[]` | `mod_ids` | High - Core functionality |
| `loot` | `whoupdated` | `users.id` | `updated_by_user_id` | Medium |
| `gold` | `who` | `users.id` | `user_id` | Medium |
| `consumableuse` | `who` | `characters.id` | `character_id` | Medium |
| `appraisal` | `characterid` | `characters.id` | `character_id` | Medium |
| `appraisal` | `lootid` | `loot.id` | `loot_id` | Medium |
| `identify` | `characterid` | `characters.id` | `character_id` | Medium |
| `identify` | `lootid` | `loot.id` | `loot_id` | Medium |
| `sold` | `lootid` | `loot.id` | `loot_id` | Low |

### 2. Timestamp Column Naming Variations

| Table | Current Column | Standard Should Be | Pattern |
|-------|----------------|-------------------|---------|
| `loot` | `lastupdate` | `updated_at` | Inconsistent |
| `appraisal` | `time` | `created_at` | Inconsistent |
| `consumableuse` | `time` | `created_at` | Inconsistent |
| `users` | `joined` | `created_at` | Inconsistent |
| `sold` | `soldon` | `sold_on` | Descriptive (acceptable) |
| `identify` | `identified_at` | `identified_at` | Descriptive (good) |

**Consistent Pattern Examples:**
- `crew.created_at`, `crew.updated_at`
- `ships.created_at`, `ships.updated_at`
- `outposts.created_at`, `outposts.updated_at`

### 3. Boolean Field Naming Inconsistencies

| Table | Current Column | Pattern | Consistency |
|-------|----------------|---------|-------------|
| `characters` | `active` | Simple state | Good |
| `crew` | `is_alive` | `is_` prefix | Good |
| `loot` | `unidentified` | Simple state | Good |
| `loot` | `masterwork` | Simple state | Good |
| `loot` | `cursed` | Simple state | Good |
| `invites` | `is_used` | `is_` prefix | Good |

### 4. Primary Key Inconsistencies

| Table | Primary Key | Pattern | Issue |
|-------|-------------|---------|-------|
| Most tables | `id SERIAL` | Standard | Good |
| `golarion_weather` | `(year, month, day, region)` | Composite | Acceptable |
| `golarion_current_date` | None | No PK | **Problem** |
| `weather_regions` | `region_name` | Natural key | Acceptable |

## Recommended Standardization Guidelines

### For Future Schema Additions Only

1. **Foreign Key Naming:**
   - Pattern: `{referenced_table}_id`
   - Examples: `character_id`, `user_id`, `loot_id`, `item_id`

2. **Timestamp Naming:**
   - `created_at` for creation timestamp
   - `updated_at` for last modification timestamp
   - Descriptive names for specific events: `identified_at`, `sold_on`, `expires_at`

3. **Boolean Field Naming:**
   - Simple states: `active`, `visible`, `enabled`
   - Descriptive states: `is_alive`, `is_used`, `is_verified`

4. **Status Field Naming:**
   - Use `status` for enum-like string values
   - Consistent constraint naming for status checks

5. **Primary Key Standards:**
   - Use `id SERIAL PRIMARY KEY` unless composite key is essential
   - Avoid natural keys as primary keys where possible

## Alternative Standardization Strategies

Since direct column renaming is not possible, consider these approaches:

### 1. View-Based Abstraction

Create standardized views for external consumption:

```sql
CREATE VIEW loot_standard AS
SELECT 
    id,
    session_date,
    quantity,
    name,
    whohas as character_id,
    itemid as item_id,
    modids as mod_ids,
    lastupdate as updated_at,
    whoupdated as updated_by_user_id,
    -- ... other mappings
FROM loot;
```

### 2. API Layer Standardization

Implement consistent field naming in API responses:

```typescript
// Database model (preserve existing names)
interface LootRecord {
  whohas: number;
  lastupdate: Date;
  itemid: number;
}

// API response (standardized names)
interface LootAPI {
  character_id: number;
  updated_at: Date;
  item_id: number;
}
```

### 3. Application Layer Mapping

Use ORM/query builders to map database columns to consistent application field names:

```javascript
const lootMapping = {
  character_id: 'whohas',
  updated_at: 'lastupdate',
  item_id: 'itemid',
  mod_ids: 'modids'
};
```

## Impact Assessment

### Technical Debt Score: 7/10 (High)
- **High impact on maintainability**: Inconsistent naming makes code harder to understand
- **Medium impact on development speed**: Developers must remember different naming patterns
- **Low impact on performance**: No performance implications
- **High impact on new developer onboarding**: Steep learning curve for understanding schema

### Risk Assessment for Column Renaming

If column renaming were attempted (NOT RECOMMENDED):

| Risk Category | Level | Description |
|---------------|-------|-------------|
| **Data Loss** | HIGH | Potential for data corruption during migration |
| **Downtime** | HIGH | Extended maintenance window required |
| **Application Breaking** | CRITICAL | All existing queries would fail |
| **Rollback Complexity** | HIGH | Difficult to reverse changes |
| **Testing Effort** | HIGH | Full application testing required |

## Recommendations

### Immediate Actions (Recommended)

1. **Document Current State**: ✅ Completed with this analysis
2. **Establish Standards**: Apply consistent naming to all NEW tables/columns only
3. **API Standardization**: Consider implementing consistent field naming in API layer
4. **Team Guidelines**: Update development guidelines to prevent future inconsistencies

### Future Considerations (Optional)

1. **View Layer**: Create standardized views for complex queries where beneficial
2. **Migration Planning**: If future major version allows breaking changes, plan comprehensive schema standardization
3. **Database Version 2.0**: Consider complete schema redesign for future major release

## Conclusion

The database schema shows significant naming inconsistencies that impact maintainability and developer experience. While direct standardization through column renaming is not feasible due to production data constraints, this analysis provides:

1. **Clear documentation** of current inconsistencies
2. **Standardization guidelines** for future schema additions  
3. **Alternative approaches** for achieving consistency without breaking changes
4. **Risk assessment** for understanding the true cost of current technical debt

**Recommended Approach**: Accept current naming for existing columns, implement strict standards for new additions, and consider API-layer standardization for improved developer experience.

---

**Next Review**: Schedule for major version planning when breaking changes may be acceptable
**Maintenance**: Update this document when new schema inconsistencies are identified