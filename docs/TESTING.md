# Testing Guide for Pathfinder Loot Tracker

This document provides comprehensive information about the testing setup and practices for the Pathfinder 1e Loot Tracker application.

## Overview

The application uses a robust testing strategy with:
- **Frontend**: Jest + React Testing Library for component and unit tests
- **Backend**: Jest + Supertest for API and integration tests
- **Database**: Dedicated test database with automated setup/teardown
- **Coverage**: Comprehensive coverage reporting with Codecov integration
- **CI/CD**: Automated testing on GitHub Actions

## Test Structure

```
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── **/__tests__/           # Component tests
│   │   ├── utils/
│   │   │   └── __tests__/              # Utility function tests
│   │   ├── setupTests.js               # Global test setup
│   │   └── utils/testUtils.js          # Test helper utilities
│   └── jest.config.js                  # Jest configuration
├── backend/
│   ├── src/
│   │   └── **/__tests__/               # Unit tests
│   ├── tests/
│   │   ├── api/                        # API endpoint tests
│   │   ├── integration/                # Integration tests
│   │   ├── utils/                      # Test utilities
│   │   ├── setupTests.js               # Global test setup
│   │   └── testDatabase.js             # Database test utilities
│   └── jest.config.js                  # Jest configuration
└── test-runner.js                      # Unified test runner
```

## Quick Start

### Run All Tests
```bash
# Run all tests
node test-runner.js

# Run with coverage
node test-runner.js --coverage

# Run only frontend tests
node test-runner.js --frontend-only

# Run only backend tests
node test-runner.js --backend-only
```

### Frontend Testing
```bash
cd frontend

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run tests for CI (no watch mode)
npm run test:ci
```

### Backend Testing
```bash
cd backend

# Setup test database (first time only)
node scripts/test-setup.js setup

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests only
npm run test:integration

# Teardown test database
node scripts/test-setup.js teardown
```

## Test Environment Setup

### Prerequisites
1. **Node.js 18+**
2. **PostgreSQL** (for backend tests)
3. **Environment Variables**:
   ```bash
   # Backend test environment
   NODE_ENV=test
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_NAME=pathfinder_loot_test
   TEST_DB_NAME=pathfinder_loot_test
   JWT_SECRET=test-jwt-secret-key
   OPENAI_API_KEY=test-openai-key
   ```

### Database Setup
The test database is automatically managed:
1. **Setup**: Creates test database and runs migrations
2. **Cleanup**: Clears data between tests for isolation
3. **Teardown**: Drops test database after testing

## Writing Tests

### Frontend Component Tests

```javascript
// Example: Testing a React component
import { renderWithProviders, getUserEvent } from '../../../utils/testUtils';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    renderWithProviders(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('should handle user interactions', async () => {
    const user = await getUserEvent();
    renderWithProviders(<MyComponent />);
    
    const button = screen.getByRole('button');
    await user.click(button);
    
    expect(screen.getByText('Result')).toBeInTheDocument();
  });
});
```

### Backend API Tests

```javascript
// Example: Testing an API endpoint
import request from 'supertest';
import app from '../../src/app';
import { ApiTestHelpers, TestAssertions } from '../utils/testHelpers';

describe('API Endpoint', () => {
  let apiHelpers;
  
  beforeAll(() => {
    apiHelpers = new ApiTestHelpers(app);
  });

  it('should create resource successfully', async () => {
    const response = await apiHelpers.authenticatedPost('/api/resource', {
      name: 'Test Resource'
    }, userId);

    TestAssertions.expectSuccessResponse(response, 201);
    expect(response.body.data).toHaveProperty('id');
  });
});
```

### Integration Tests

```javascript
// Example: Testing complete workflow
describe('User Workflow', () => {
  it('should complete loot management workflow', async () => {
    // 1. Create user and character
    const user = await dbHelpers.insertUser();
    const character = await dbHelpers.insertCharacter(user.id);
    
    // 2. Add loot item
    const lootResponse = await request(app)
      .post('/api/loot')
      .set('Authorization', apiHelpers.createAuthHeader(user.id))
      .send(lootData);
    
    // 3. Verify and continue workflow...
  });
});
```

## Test Utilities

### Frontend Test Utils (`frontend/src/utils/testUtils.js`)
- `renderWithProviders()`: Renders components with all necessary providers
- `mockApiService()`: Creates mock API service for testing
- `getUserEvent()`: Provides user event utilities
- Mock data generators and API responses

### Backend Test Utils (`backend/tests/utils/testHelpers.js`)
- `ApiTestHelpers`: Simplified API testing with authentication
- `DatabaseTestHelpers`: Database operations for tests
- `MockDataGenerators`: Generate test data
- `TestAssertions`: Common assertion helpers

## Test Categories

### Unit Tests
- **Location**: `src/**/__tests__/`
- **Purpose**: Test individual functions and components in isolation
- **Examples**: Utility functions, pure components, business logic

### Component Tests
- **Location**: `frontend/src/components/**/__tests__/`
- **Purpose**: Test React components with user interactions
- **Examples**: Login form, loot management components, dialogs

### API Tests
- **Location**: `backend/tests/api/`
- **Purpose**: Test API endpoints with mocked controllers
- **Examples**: Authentication routes, CRUD operations, validation

### Integration Tests
- **Location**: `backend/tests/integration/`
- **Purpose**: Test complete workflows with real database
- **Examples**: User registration → login → loot management

## Coverage Requirements

### Thresholds
- **Global**: 70% minimum coverage
- **Frontend**: 70% minimum coverage
- **Backend**: 75% minimum coverage

### Coverage Reports
- **HTML Report**: `coverage/lcov-report/index.html`
- **LCOV Report**: `coverage/lcov.info`
- **Text Summary**: Displayed in terminal

### Excluded Files
- Test files (`*.test.js`, `*.spec.js`)
- Setup files (`setupTests.js`, `testUtils.js`)
- Entry points (`index.js`)
- Build artifacts

## CI/CD Integration

### GitHub Actions
- **Trigger**: Push/PR to main branches
- **Jobs**: Separate frontend and backend test jobs
- **Database**: PostgreSQL service container for backend tests
- **Coverage**: Automatic upload to Codecov
- **PR Comments**: Coverage reports on pull requests

### Workflow File
See `.github/workflows/test-coverage.yml` for complete CI/CD configuration.

## Best Practices

### General
1. **Test Isolation**: Each test should be independent
2. **Descriptive Names**: Test names should explain what is being tested
3. **AAA Pattern**: Arrange, Act, Assert structure
4. **Mock External Dependencies**: Database, APIs, services
5. **Test Edge Cases**: Error conditions, boundary values

### Frontend Specific
1. **User-Centric Testing**: Test from user's perspective
2. **Accessibility**: Include ARIA attributes and roles in tests
3. **Loading States**: Test loading and error states
4. **Form Validation**: Test validation messages and error handling

### Backend Specific
1. **Database Transactions**: Use transactions for test isolation
2. **Authentication**: Test protected routes and authorization
3. **Input Validation**: Test validation middleware
4. **Error Handling**: Test error responses and edge cases

## Debugging Tests

### Frontend
```bash
# Run specific test file
npm test -- Login.test.js

# Run tests in debug mode
npm test -- --debug

# Update snapshots
npm test -- --updateSnapshot
```

### Backend
```bash
# Run specific test file
npm test -- auth.test.js

# Run with verbose output
npm test -- --verbose

# Run specific test pattern
npm test -- --testNamePattern="should login user"
```

### Common Issues
1. **Database Connection**: Ensure PostgreSQL is running and accessible
2. **Environment Variables**: Check all required variables are set
3. **Port Conflicts**: Ensure test database uses different port
4. **Async Issues**: Use proper async/await patterns
5. **Mock Issues**: Clear mocks between tests

## Performance Considerations

1. **Parallel Execution**: Tests run in parallel by default
2. **Database Pooling**: Connection pooling for better performance
3. **Test Timeouts**: Configured for async operations
4. **Memory Management**: Proper cleanup of resources

## Contributing

When adding new features:
1. **Write Tests First**: TDD approach recommended
2. **Maintain Coverage**: Ensure coverage thresholds are met
3. **Update Documentation**: Update this guide if needed
4. **Run Full Test Suite**: Before submitting PRs

## Troubleshooting

### Common Solutions
```bash
# Clear Jest cache
npx jest --clearCache

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Reset test database
node backend/scripts/test-setup.js teardown
node backend/scripts/test-setup.js setup

# Check test environment
node -e "console.log(process.env.NODE_ENV)"
```

### Getting Help
1. Check test output for specific error messages
2. Verify environment setup matches requirements
3. Review test examples in existing codebase
4. Check GitHub Actions logs for CI failures

---

For more detailed information about specific testing patterns or utilities, refer to the inline documentation in the test files themselves.