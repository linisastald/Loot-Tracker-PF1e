# Feature-Based Testing Architecture

## Overview

This testing structure organizes tests by feature/domain rather than by frontend/backend, making it easier to:
- Test complete feature workflows
- Understand test coverage by business domain
- Enable/disable testing for specific features
- Coordinate between frontend and backend testing

## Directory Structure

```
tests/
├── features/                           # Feature-based test organization
│   ├── auth/                          # Authentication & User Management
│   │   ├── auth.api.test.js           # Backend API routes
│   │   ├── login.component.test.js    # Frontend component
│   │   └── login.simple.test.js       # Simplified tests
│   │
│   ├── loot/                          # Loot Management (💰 PRIORITY)
│   │   ├── README.md                  # Coverage analysis & roadmap
│   │   ├── lootManagement.integration.test.js # Complete workflows
│   │   ├── pendingSaleManagement.component.test.js # Recently fixed DM sell page
│   │   ├── lootService.test.js        # Frontend API service
│   │   └── salesService.test.js       # Backend sale logic (recently fixed)
│   │
│   ├── gold/                          # Gold/Currency Management
│   │   └── (tests to be created)
│   │
│   ├── characters/                    # Character Management
│   │   └── (tests to be created)
│   │
│   ├── ships/                         # Ship Management
│   │   └── (tests to be created)
│   │
│   ├── crew/                          # Crew Management
│   │   └── (tests to be created)
│   │
│   ├── calendar/                      # Calendar & Weather
│   │   └── (tests to be created)
│   │
│   ├── outposts/                      # Outpost Management
│   │   └── (tests to be created)
│   │
│   ├── campaign/                      # Campaign & Settings
│   │   └── (tests to be created)
│   │
│   ├── integrations/                  # API & External Integrations
│   │   └── (tests to be created)
│   │
│   └── utilities/                     # Utility & Core Functions
│       ├── simple.component.test.js   # Basic component test
│       ├── saleValueCalculator.test.js # Backend utility
│       └── frontend.utils.test.js     # Frontend utilities
│
├── shared/                            # Shared test utilities
│   ├── utils/                         # Test helper functions
│   │   ├── testHelpers.js            # API & DB test helpers
│   │   └── mockDatabase.js           # Database mocking
│   ├── setupMocks.js                  # Global mocks
│   ├── setupTests.js                  # Test environment setup
│   └── testDatabase.js                # Test database configuration
│
└── README.md                          # This file
```

## GitHub Actions Integration

The `.github/workflows/feature-tests.yml` workflow is configured to run tests by feature:

- **Selective Testing**: Enable/disable specific feature test jobs
- **Parallel Execution**: Each feature can run independently
- **CI Resource Management**: Currently disabled to save CI minutes
- **Granular Reporting**: Know exactly which features are failing

## Current Test Coverage

### ✅ **Well Tested Features**
- **Authentication**: API routes, component tests, validation
- **Loot Management**: Integration tests, recently fixed components

### ⚠️ **Partially Tested Features**
- **Utilities**: Basic calculator and component tests

### ❌ **Missing Test Coverage**
- Gold/Currency Management
- Character Management  
- Ship Management
- Crew Management
- Calendar & Weather
- Outpost Management
- Campaign & Settings
- External Integrations

## Priority Recommendations

### Phase 1 (Immediate - Critical Fixes)
1. **Loot Management** - Complete missing tests for recently fixed bugs
2. **Gold Management** - Test currency validation and negative balance prevention
3. **Authentication** - Expand security and edge case testing

### Phase 2 (Core Features)
4. **Character Management** - User and character CRUD operations
5. **Ship Management** - Ship status tracking and relationships
6. **Crew Management** - Movement and recruitment workflows

### Phase 3 (Advanced Features)
7. **Calendar & Weather** - Golarion calendar system
8. **Campaign Settings** - DM tools and permissions
9. **External Integrations** - OpenAI and Discord integrations

## Running Tests

### All Tests (when enabled)
```bash
# Run all feature tests
npm test

# Run specific feature
npm test -- --testPathPattern="features/loot"
```

### Individual Feature Tests
```bash
# Loot management tests
npm test tests/features/loot/

# Authentication tests  
npm test tests/features/auth/

# Utility tests
npm test tests/features/utilities/
```

### GitHub Actions
- Currently disabled to save CI minutes
- Enable by setting `if: true` for desired test jobs in `.github/workflows/feature-tests.yml`
- Enable specific features: `if: contains(github.event.head_commit.message, '[test-loot]')`

## Test Development Guidelines

### 1. **Test Naming Convention**
- `feature.type.test.js` (e.g., `lootService.test.js`, `login.component.test.js`)
- `feature.integration.test.js` for end-to-end workflows
- `feature.api.test.js` for backend API testing

### 2. **Test Organization**
- Group related functionality in the same test file
- Use descriptive `describe` blocks for feature areas
- Test both happy path and error conditions

### 3. **Mock Strategy**
- Mock external dependencies (APIs, databases)
- Preserve business logic testing
- Use shared mocks in `tests/shared/`

### 4. **Coverage Goals**
- Focus on critical business logic first
- Ensure recently fixed bugs have tests
- Test edge cases and error conditions

## Benefits of This Structure

1. **Feature-Focused**: Easy to understand what's tested for each feature
2. **Workflow Testing**: Can test complete user journeys
3. **Maintainable**: Clear separation of concerns
4. **Scalable**: Easy to add new features or expand existing ones
5. **CI Efficiency**: Run only tests for changed features
6. **Developer Experience**: Clear test organization and discovery