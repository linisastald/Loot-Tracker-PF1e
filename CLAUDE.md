# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Pathfinder 1st Edition (PF1e) Loot and Gold Management System, a full-stack web application for managing loot, gold, crew, ships, and campaigns in tabletop RPG sessions. The system supports multiple campaign instances (Rise of the Runelords, Skulls & Shackles) with separate databases.

## Technology Stack

### Frontend
- **React 19** with TypeScript
- **Material-UI v7** (MUI) - Component library
  - **IMPORTANT**: MUI v7 uses `size={{xs, md}}` instead of `item xs={} md={}`
  - Always check existing components for current API patterns
- **React Router v6** - Routing
- **Axios** - HTTP client
  - **CRITICAL**: Always use the configured `api` utility (`frontend/src/utils/api.ts`), NEVER raw `axios`
  - The `api` utility handles CSRF token fetching and injection automatically
- **Vite** - Build tool and dev server
- **Vitest** - Testing framework

### Backend
- **Node.js** with Express
- **PostgreSQL** - Database with pg driver
- **JWT** - Authentication with HTTP-only cookies
- **Winston** - Logging with daily rotation
- **CSRF Protection** - Using csurf middleware
- **Rate Limiting** - Express rate limit
- **Helmet** - Security headers

### Infrastructure
- **Docker** - Containerization
- **PostgreSQL 16** - Database server
- **Node.js** - Single container serving both API and frontend

## Development Environment Constraints

**IMPORTANT**: Claude Code does not have direct access to run applications on this machine.
- Cannot execute `npm start`, `npm run dev`, or Docker commands to test changes
- Cannot access running servers or databases
- User must build and run the application to test changes
- User will provide build output and error messages for troubleshooting

## Architecture

The application follows a three-tier architecture:

### 1. Frontend Layer
- Location: `/frontend`
- Entry point: `frontend/src/App.tsx`
- React SPA with TypeScript
- Material-UI v7 components
- Protected routes with authentication HOC
- Key features:
  - Item and loot management
  - Crew and ship management
  - Weather system and Golarion calendar
  - City services (item availability, spellcasting)
  - Session management and Discord integration

### 2. Backend Layer
- Location: `/backend`
- Entry point: `backend/index.js`
- Express REST API
- JWT authentication with role-based access control
- Middleware: CSRF, rate limiting, security headers
- External integrations:
  - OpenAI API for item parsing
  - Discord webhooks for session notifications
- Serves frontend static files in production

### 3. Database Layer
- PostgreSQL with extensive schema for game mechanics
- Schema files: `/database/*.sql`
- Migrations: `/backend/migrations/*.sql`
- Key tables: users, characters, loot, item, mod, ships, crew, outposts, city, spells
- Migration system tracks and applies schema changes automatically

## Specialized Agent System

This project uses a domain-specific agent architecture for efficient development. Agents are automatically invoked based on task context and proactively assist with their domain expertise.

### Agent Domains & Responsibilities

#### 1. Frontend Agent
**Domain**: React, TypeScript, UI/UX, Material-UI components

**Responsibilities**:
- Create and modify React components (`.tsx` files in `/frontend/src/components/`)
- Update routing in `App.tsx`
- Implement UI/UX designs with Material-UI v7
- Manage component state and hooks
- Client-side form validation
- Frontend service layer (`/frontend/src/services/`)

**File Scope**:
- `frontend/src/**/*.tsx`
- `frontend/src/**/*.ts`
- `frontend/package.json`
- Frontend configuration files

**Code Standards**:
- Use TypeScript for all new components
- Follow Material-UI v7 API (Grid uses `size={{xs, md}}`, not `item xs md`)
- Use functional components with hooks
- Implement proper TypeScript interfaces
- Use ErrorBoundary wrappers for page components
- Avoid `any` types - use proper TypeScript interfaces

**Common Pitfalls**:
- **CSRF Token Errors** - NEVER use raw `axios`, always import and use `api` utility from `utils/api.ts`
- MUI Grid API changed in v7 - always use `size={{}}` format
- SelectChangeEvent type required for Select onChange handlers
- Always wrap new routes in ErrorBoundary components
- Remember to add new pages to navigation in Sidebar.jsx

**Coordination Points**:
- Calls Backend Agent for API endpoint creation
- Coordinates with Database Agent for data structure requirements
- Requests Frontend Code Review Agent before completion

---

#### 2. Backend Agent
**Domain**: Node.js, Express, API development, business logic

**Responsibilities**:
- Create and modify API routes (`/backend/src/api/routes/*.js`)
- Implement controllers (`/backend/src/controllers/*Controller.js`)
- Create models (`/backend/src/models/*.js`)
- Business logic and validation
- Middleware implementation
- External API integrations (OpenAI, Discord)

**File Scope**:
- `backend/src/**/*.js`
- `backend/index.js`
- `backend/package.json`
- Backend configuration files

**Code Standards**:
- Use `controllerFactory.createHandler()` to wrap each exported function
- Implement proper error handling with `controllerFactory.createValidationError()`, `createNotFoundError()`
- Use logger instead of console.log/console.error
- All API responses use standardized format via `apiResponseMiddleware`
- Parameterized queries to prevent SQL injection
- JWT authentication via HTTP-only cookies

**Common Pitfalls**:
- Don't forget to register new routes in `backend/index.js`
- Apply CSRF protection to all routes except auth endpoints
- Use logger for all output, never console.log
- Always validate input before database operations
- Remember rate limiting is applied globally
- Use `controllerFactory.createHandler()` not `wrapAsync()` (doesn't exist)

**Coordination Points**:
- Calls Database Agent for schema changes and complex queries
- Coordinates with Frontend Agent for API contract definition
- Requests Backend Code Review Agent before completion

---

#### 3. Database Agent
**Domain**: PostgreSQL, schema design, migrations, queries

**Responsibilities**:
- Create database migrations (`/backend/migrations/*.sql`)
- Design schema for new features
- Write complex SQL queries
- Optimize database performance
- Create indexes and constraints
- Data modeling

**File Scope**:
- `backend/migrations/*.sql`
- `database/*.sql`
- Model files that contain raw SQL queries
- Database configuration files

**Code Standards**:
- **NEVER** change existing column or table names
- Always use parameterized queries ($1, $2, etc.)
- Include proper indexes for foreign keys and frequently queried columns
- Add comments to tables and columns for documentation
- Migrations must be reversible when possible
- Use transactions for multi-table operations

**Common Pitfalls**:
- Production database has legacy column names (`whohas` not `character_id`, `lastupdate` not `created_at`)
- Always check `/database/init.sql` for actual column names
- Don't assume standard naming - verify actual schema
- Migration numbers must be sequential (check highest existing number)
- PostgreSQL array syntax uses `'{}'` not `[]`

**Coordination Points**:
- Coordinates with Backend Agent for model requirements
- Works with Frontend Agent to understand data structure needs
- Requests Database Code Review Agent before completion

---

#### 4. Full-Stack Agent
**Domain**: Cross-layer features, system architecture, feature coordination

**Responsibilities**:
- Coordinate multi-layer features (database → backend → frontend)
- System architecture decisions
- Feature planning and breakdown
- Integration of cross-cutting concerns
- End-to-end feature implementation
- Deployment configuration

**File Scope**:
- All files across all layers
- Docker configuration
- CI/CD scripts
- Documentation

**Coordination**:
- Delegates domain-specific work to specialized agents
- Ensures consistency across all layers
- Manages feature branch workflow
- Coordinates code reviews across all layers

---

#### 5. QA Agent
**Domain**: Testing, test creation, quality assurance

**Responsibilities**:
- Create unit tests for frontend components (Vitest, React Testing Library)
- Create backend integration tests (Jest)
- Design test cases for new features
- Ensure test coverage for critical paths
- Create test data and fixtures
- Validate test infrastructure

**File Scope**:
- `frontend/src/**/*.test.tsx`
- `frontend/src/**/*.test.ts`
- `backend/src/**/*.test.js`
- Test configuration files

**Code Standards**:
- Use Vitest for frontend tests
- Use Jest for backend tests
- Mock external dependencies (APIs, database)
- Test both success and error cases
- Use React Testing Library for component tests
- Aim for meaningful coverage, not just high percentages

**Testing Requirements**:
- All new API endpoints require integration tests
- Complex business logic requires unit tests
- UI components with user interaction require component tests
- Database queries should be tested with mocked connections

---

#### 6. Frontend Code Review Agent
**Domain**: Frontend code quality, React/TypeScript best practices

**Automatically invoked**:
- Before committing frontend changes
- When Frontend Agent completes work
- On explicit request for frontend review

**Review Checklist**:
- **CSRF Protection**: All API calls use `api` utility from `utils/api.ts`, not raw `axios`
- TypeScript types are properly defined (no `any` unless justified)
- Material-UI v7 API is used correctly (Grid uses `size={{}}`)
- Components are properly memoized where needed
- Error boundaries are in place
- Accessibility attributes are present
- No console.log statements in final code
- Proper error handling for async operations
- Routes are registered and protected appropriately
- API endpoints do not include `/api` prefix (handled by api utility)

---

#### 7. Backend Code Review Agent
**Domain**: Backend code quality, API design, security

**Automatically invoked**:
- Before committing backend changes
- When Backend Agent completes work
- On explicit request for backend review

**Review Checklist**:
- Controllers use `controllerFactory.createHandler()` for each export
- Proper error handling with appropriate error types
- Logger used instead of console statements
- CSRF protection applied to routes
- Input validation implemented
- SQL queries are parameterized
- Authentication/authorization checked where needed
- API responses follow standard format

---

#### 8. Database Code Review Agent
**Domain**: Schema design, migration safety, query optimization

**Automatically invoked**:
- Before committing migrations
- When Database Agent completes work
- On explicit request for database review

**Review Checklist**:
- No changes to existing column/table names
- Migrations are numbered sequentially
- Proper indexes created for foreign keys
- Column types are appropriate for data
- Constraints are properly defined
- Comments added for documentation
- Migration is reversible (if applicable)
- No hard-coded credentials or sensitive data

---

#### 9. Pathfinder 1e Expert Agent
**Domain**: Pathfinder 1st Edition game mechanics, rules, lore, and calculations

**Responsibilities**:
- Validate game mechanics implementations for accuracy
- Provide correct rules references and calculations
- Ensure lore accuracy for Inner Sea region and Golarion
- Advise on settlement mechanics (base value, purchase limits, spell availability)
- Review item values, spell costs, and other game calculations
- Verify alignment with official Paizo Pathfinder 1e rules
- **Admit uncertainty** - knows when it doesn't know something and asks questions
- Never fabricate rules or mechanics that don't exist

**Consulted for**:
- Settlement/city mechanics and statistics
- Spell availability and spellcasting service costs
- Item availability calculations and pricing
- Character class mechanics and progression
- Combat mechanics and action economy
- Skill checks and difficulty classes
- Lore accuracy (nations, cities, NPCs, organizations)
- Adventure Path references (Rise of the Runelords, Skulls & Shackles, etc.)

**File Scope**:
- All files implementing game mechanics:
  - `backend/src/models/*` (especially City, ItemSearch, SpellcastingService)
  - `backend/src/controllers/*` (game logic validation)
  - `backend/migrations/*` (game data accuracy)
  - `frontend/src/components/*` (accurate rule presentation)
  - Any file containing Pathfinder 1e calculations or rules

**Knowledge Standards**:
- **Paizo Official Materials Only** - Core Rulebook, Advanced Player's Guide, Ultimate Combat, etc.
- **No Third-Party Content** - Avoid Dreamscarred Press, Drop Dead Studios, etc.
- **No Homebrew** - Only official published rules
- **Pathfinder 1e Specific** - Don't confuse with Pathfinder 2e or D&D 3.5/5e
- **Source Verification** - Reference specific rulebooks when possible
- **Admit Uncertainty** - If unsure, ask rather than guess or fabricate

**Common Pitfalls**:
- Making up rules that don't exist in official materials
- Confusing Pathfinder 1e mechanics with Pathfinder 2e or D&D
- Assuming third-party content is official Paizo
- Fabricating city names or lore not in official sources
- Incorrect spell cost formulas (should be: spell_level × caster_level × 10 gp)
- Wrong settlement size modifiers (base value, purchase limit, max spell level)
- Inaccurate caster level minimums (should be: 2×spell_level - 1, min 1)

**Example Consultations**:
- "Is this spell cost calculation correct for Pathfinder 1e?"
- "What should the base value be for a Large City?"
- "Is Sandpoint accurately represented as a Small Town in Varisia?"
- "What's the correct availability threshold for items over base value?"
- "Is this a real Pathfinder 1e spell or homebrew?"
- "What level 9 spells exist in official Paizo materials?"

**Coordination Points**:
- **All Agents** consult when implementing/modifying game mechanics
- **Database Agent** - Validates settlement statistics, item values, spell data
- **Backend Agent** - Reviews calculation formulas and game logic
- **Frontend Agent** - Ensures accurate rule presentation to users
- **Code Review Agents** - Verifies game mechanics accuracy in reviews

**When Uncertain**:
The Pathfinder 1e Expert should explicitly state when it doesn't know something:
- "I'm not certain about this rule. Let me ask: [question]"
- "This might be third-party content. Can you verify the source?"
- "I don't have access to this specific sourcebook. Which book is this from?"
- "This seems like it might be a house rule. Is this from official Paizo materials?"

**Current Game Mechanics in Project**:
- Settlement mechanics (city sizes, base values, purchase limits, max spell levels)
- Item availability rolls (d100 based on item value vs. base value)
- Spellcasting service costs (spell_level × caster_level × 10 gp)
- Level 9 spell availability (1% chance even in metropolises)
- Golarion calendar and date tracking
- Inner Sea region cities (Varisia, The Shackles, Taldor, etc.)
- Ship and crew management (Skulls & Shackles)
- Weather system integration

---

## Git Workflow

### Branch Strategy
- `master` - Production-ready code
- `feature/*` - New features (e.g., `feature/city-services`)
- `fix/*` - Bug fixes
- `refactor/*` - Code refactoring

### Commit Message Format
Use conventional commits format:
```
<type>: <description>

<optional body>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`

**Examples**:
```
feat: Add City Services feature for item availability

fix: Update Grid component to MUI v7 API

refactor: Extract duplicate logic into utility function
```

### Workflow Steps
1. Create feature branch: `git checkout -b feature/feature-name`
2. Implement changes with appropriate agent coordination
3. Run code review agents before committing
4. Commit with proper message format
5. Push to remote: `git push -u origin feature/feature-name`
6. User tests the feature (Claude cannot run locally)
7. Merge to master when ready

---

## Build & Deployment

### Docker Build Process

**Build Script**: `build_image.sh`
```bash
# Build from feature branch
bash build_image.sh --branch feature/city-services --tag test

# Build from master
bash build_image.sh --branch master --tag latest
```

**Build Process**:
1. Creates Git worktree for specified branch
2. Builds Docker image with multi-stage build:
   - Installs backend dependencies
   - Installs frontend dependencies
   - Builds frontend (TypeScript compilation + Vite build)
   - Copies built frontend to backend container
   - Removes dev dependencies
3. Tags image with specified tag
4. User deploys and tests

**Important Notes**:
- Claude cannot execute build or run commands
- User must run build script and provide output
- TypeScript errors will fail the build
- Build happens in worktree to preserve current branch

### Deployment
```bash
# Using docker-compose
docker-compose -f docker/docker-compose.yml up -d

# Update running containers
./update_containers.sh
```

### Migration Execution
- Migrations run automatically on server startup
- Migration tracking table: `schema_migrations`
- Migrations are sequential and tracked by number
- Failed migrations will prevent server start

---

## Development Patterns & Standards

### API Structure
**Routes** (`backend/src/api/routes/*.js`):
```javascript
const express = require('express');
const router = express.Router();
const controller = require('../../controllers/controllerName');
const verifyToken = require('../../middleware/auth');

router.get('/', verifyToken, controller.getAll);
router.post('/', verifyToken, controller.create);

module.exports = router;
```

**Controllers** (`backend/src/controllers/*Controller.js`):
```javascript
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

const getAll = async (req, res) => {
  const items = await Model.getAll();
  res.json(items);
};

const create = async (req, res) => {
  const item = await Model.create(req.body);
  controllerFactory.sendCreatedResponse(res, item, 'Item created successfully');
};

// Export wrapped controllers
exports.getAll = controllerFactory.createHandler(getAll, {
  errorMessage: 'Error fetching items'
});

exports.create = controllerFactory.createHandler(create, {
  errorMessage: 'Error creating item'
});
```

**Models** (`backend/src/models/*.js`):
```javascript
const dbUtils = require('../utils/dbUtils');

exports.getAll = async () => {
  const query = 'SELECT * FROM table_name ORDER BY id';
  const result = await dbUtils.executeQuery(query);
  return result.rows;
};
```

### Frontend Component Structure
**Page Component**:
```typescript
import React, { useState, useEffect } from 'react';
import { Container, Typography, Box } from '@mui/material';
import api from '../../utils/api'; // IMPORTANT: Use api utility, not raw axios

interface DataType {
  id: number;
  name: string;
}

const PageName: React.FC = () => {
  const [data, setData] = useState<DataType[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Use api utility - it handles CSRF tokens automatically
      // Note: No /api prefix needed (api utility adds it)
      const response: any = await api.get('/endpoint');
      // Handle response unwrapping from api interceptor
      const result = response.data || response;
      setData(result);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch data');
    }
  };

  return (
    <Container maxWidth="lg">
      <Typography variant="h4">Page Title</Typography>
      {/* Component content */}
    </Container>
  );
};

export default PageName;
```

### Database Migration Pattern
```sql
-- Migration: Description of what this migration does
-- migration_number_description.sql

-- Create table
CREATE TABLE IF NOT EXISTS table_name (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_table_column ON table_name(column_name);

-- Comments
COMMENT ON TABLE table_name IS 'Description of table purpose';
COMMENT ON COLUMN table_name.column IS 'Description of column';
```

---

## Environment Variables

### Backend Required
```bash
# Database
DB_USER=postgres
DB_HOST=localhost
DB_NAME=database_name
DB_PASSWORD=secure_password
DB_PORT=5432

# Authentication
JWT_SECRET=your_jwt_secret

# External APIs
OPENAI_API_KEY=your_openai_key

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Logging
LOG_DIR=/app/backend/logs
NODE_ENV=production
```

### Frontend
```bash
# API URL (production uses /api, development uses http://localhost:5000/api)
REACT_APP_API_URL=/api
```

---

## CSRF Token Handling

The application uses CSRF (Cross-Site Request Forgery) protection for all API requests. This is handled automatically through a configured axios instance.

### Frontend API Utility (`frontend/src/utils/api.ts`)

**CRITICAL**: Always use the `api` utility for all HTTP requests, NEVER use raw `axios`.

```typescript
import api from '../../utils/api'; // Correct
// import axios from 'axios';  // WRONG - will cause CSRF errors

// GET request
const response = await api.get('/endpoint');
const data = response.data || response;

// POST request
const response = await api.post('/endpoint', { data });
const result = response.data || response;
```

### How it Works

The `api` utility is a configured axios instance with request interceptors that:
1. **Fetches CSRF token** from `/api/auth/csrf-token` endpoint on first request
2. **Caches token** in localStorage for subsequent requests
3. **Automatically injects** the token in `X-CSRF-Token` header for every request
4. **Handles token refresh** if token becomes invalid

### Important Notes

- **No `/api` prefix needed**: The api utility automatically adds `/api` to all endpoints
  ```typescript
  api.get('/cities')  // Correct - requests /api/cities
  api.get('/api/cities')  // Wrong - requests /api/api/cities
  ```

- **Response unwrapping**: The api utility may unwrap response data, so use:
  ```typescript
  const data = response.data || response;
  ```

- **Error handling**: CSRF errors will show as `ForbiddenError: invalid csrf token`
  - This indicates raw axios usage or missing CSRF token
  - Solution: Replace axios with api utility

### Backend CSRF Protection

All routes except authentication endpoints are protected with `csrfProtection` middleware:
```javascript
router.post('/', verifyToken, csrfProtection, controller.create);
```

Auth endpoints (`/api/auth/*`) are excluded from CSRF protection to allow initial login.

---

## Important Development Guidelines

### Database Schema Management

**NEVER change existing database column or table names**. The production database has existing data with specific column names that must be preserved:
- `loot` table uses `whohas` (not `character_id`)
- `loot` table uses `lastupdate` (not `created_at`)
- Always verify column names in `/database/init.sql` before writing queries

Creating new tables and columns is acceptable when required for new features, but existing schema must remain unchanged to maintain compatibility with production data.

### Docker and Infrastructure Changes

**Be extremely cautious with infrastructure changes**:
- NEVER change volume mount paths without explicit user confirmation
- Preserve all existing Docker volume mounts exactly as configured
- Do not modify database connection parameters without understanding the deployment
- Always ask for clarification before changing infrastructure configuration

### Architecture Decisions

**Current architecture**:
- Single container with Node.js backend serving both API and React frontend
- Backend runs on port 5000, serves frontend at `/` and API at `/api/*`
- No nginx layer - Node.js directly serves static files in production
- External proxy manager handles routing (not part of the application container)

### Common Pitfalls by Domain

#### Frontend Pitfalls
1. **Raw axios usage** - NEVER use `import axios from 'axios'` - always use `import api from '../../utils/api'`
   - The `api` utility automatically handles CSRF token fetching and injection
   - Using raw axios will result in "invalid csrf token" errors
   - Remove `/api` prefix from endpoints when using api utility (it adds it automatically)
2. **MUI Grid API** - Use `size={{xs: 12, md: 6}}` not `item xs={12} md={6}`
3. **TypeScript anys** - Always define proper interfaces
4. **Missing ErrorBoundary** - Wrap all routes in ErrorBoundary
5. **Console statements** - Remove before committing
6. **Unregistered routes** - Add new routes to App.tsx AND Sidebar navigation
7. **Missing page title** - Update getPageTitle() in MainLayout.tsx

#### Backend Pitfalls
1. **Console logging** - Use logger, never console.log
2. **Unregistered routes** - Add route imports and app.use() in backend/index.js
3. **Missing CSRF protection** - Apply csrfProtection middleware to routes
4. **Unwrapped controllers** - Must use controllerFactory.createHandler() for each export
5. **Direct SQL in controllers** - Put queries in models
6. **Validation errors** - Use controllerFactory.createValidationError()

#### Database Pitfalls
1. **Column name changes** - NEVER change existing columns
2. **Hardcoded values** - Use parameterized queries ($1, $2)
3. **Missing indexes** - Add indexes for foreign keys
4. **Migration numbering** - Must be sequential
5. **Array syntax** - PostgreSQL uses `'{}'` not `[]`
6. **Schema assumptions** - Always verify actual column names

---

## Testing Infrastructure

### Frontend Testing
- **Framework**: Vitest with React Testing Library
- **Location**: `frontend/src/**/*.test.tsx`
- **Run**: `cd frontend && npm test`

### Backend Testing
- **Framework**: Jest
- **Location**: `backend/src/**/*.test.js`
- **Types**: Unit tests (mocked DB) and integration tests (real DB)
- **Run**: `cd backend && npm test`

### Test Requirements
- All new API endpoints require integration tests
- Complex business logic requires unit tests
- UI components with user interaction require component tests
- Aim for meaningful coverage of critical paths

---

## Logging Configuration

**Backend Logger** (Winston):
- Logs to files in `/app/backend/logs` when permissions allow
- Falls back to console logging if file permissions denied
- Configurable via `LOG_DIR` environment variable
- Daily log rotation
- Different log levels: error, warn, info, debug

**Usage**:
```javascript
const logger = require('../utils/logger');

logger.info('Operation completed successfully');
logger.error('Operation failed', { error: err.message });
logger.warn('Deprecated API usage detected');
```

---

## Agent Invocation Guidelines

### Automatic Invocation
Agents are automatically invoked based on context:
- File paths being modified (frontend/, backend/, database/)
- Keywords in user requests ("update the API", "create a component")
- Phase of work (implementation vs. review vs. testing)

### Agent Coordination
When work requires multiple domains:
1. Full-Stack Agent creates overall plan
2. Delegates to domain-specific agents in sequence:
   - Database Agent creates schema/migration
   - Backend Agent creates API endpoints
   - Frontend Agent creates UI components
3. QA Agent creates tests for all layers
4. Code Review Agents review each layer
5. Full-Stack Agent coordinates final integration

### Proactive Actions
Agents should proactively:
- **Frontend Review Agent**: Check MUI v7 API compliance when Grid components are modified
- **Backend Review Agent**: Verify logger usage when new files are created
- **Database Review Agent**: Check for column name changes in migrations
- **QA Agent**: Suggest test cases when new features are implemented
- **Pathfinder 1e Expert**: Validate game mechanics accuracy when implementing rules or calculations

---

## Recent Feature Examples

### City Services Feature (Reference Implementation)
A complete full-stack feature demonstrating proper patterns:

**Database** (`backend/migrations/019_add_city_services.sql`):
- Three new tables: `city`, `item_search`, `spellcasting_service`
- Proper indexes and constraints
- Default data for settlement sizes
- Documentation comments

**Backend**:
- Models: `City.js`, `ItemSearch.js`, `SpellcastingService.js`
- Controllers: `cityController.js`, `itemSearchController.js`, `spellcastingController.js`
- Routes: `cities.js`, `itemSearch.js`, `spellcasting.js`
- Implements Pathfinder 1e rules for item availability calculations

**Frontend** (`CityServices.tsx`):
- Tabbed interface (item search + spellcasting)
- Material-UI v7 components with proper types
- Error handling and user feedback
- Integrated into App.tsx routing and Sidebar navigation
- Uses `api` utility for proper CSRF token handling

This feature demonstrates:
- Complete vertical slice from database to UI
- Proper agent coordination
- MUI v7 API compliance
- TypeScript best practices
- CSRF token handling with api utility
- Accurate Pathfinder 1e game mechanics implementation (validated by PF1e Expert)

---

## Code Quality Standards

### TypeScript
- No `any` types unless absolutely necessary (document why)
- Proper interface definitions for all data structures
- Use type guards for runtime type checking
- Leverage TypeScript's strict mode

### React
- Functional components only (no class components)
- Proper hook usage and dependencies
- Memoization for expensive operations
- Error boundaries for error handling

### Node.js
- Async/await for asynchronous operations
- Proper error handling with try/catch
- Logger for all output
- Environment variables for configuration

### Database
- Parameterized queries always
- Transactions for multi-table operations
- Proper indexing strategy
- Normalized schema design

### Security
- CSRF protection on all routes
- Rate limiting on API endpoints
- JWT in HTTP-only cookies
- Input validation and sanitization
- Parameterized queries (no SQL injection)
- Security headers (Helmet)

---

## Summary for Claude Code Agents

When working on this project:
1. **Identify your domain** - Are you Frontend, Backend, Database, Full-Stack, QA, Review, or Pathfinder 1e Expert?
2. **Stay in your lane** - Only modify files in your domain
3. **Coordinate when needed** - Request other agents for cross-domain work
4. **Validate game mechanics** - Consult Pathfinder 1e Expert for rules accuracy
5. **Follow patterns** - Use existing code as reference
6. **Review before commit** - Invoke appropriate review agent
7. **Test your work** - Work with QA agent to create tests
8. **Remember constraints** - You cannot build or run the app locally
9. **Document changes** - Update relevant documentation

The user will handle:
- Building the application (build_image.sh)
- Running the application (Docker)
- Testing the application
- Providing error messages and build output for troubleshooting
