# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Pathfinder 1st Edition (PF1e) Loot and Gold Management System, a full-stack web application for managing loot, gold, crew, ships, and campaigns in tabletop RPG sessions. The system supports multiple campaign instances (Rise of the Runelords, Skulls & Shackles) with separate databases.

## Architecture

The application follows a three-tier architecture:

1. **Frontend**: React-based SPA with Material-UI components
   - Location: `/frontend`
   - Entry point: `frontend/src/App.js`
   - Key features: Item management, crew management, ship management, weather system, Golarion calendar

2. **Backend**: Node.js/Express REST API
   - Location: `/backend`
   - Entry point: `backend/index.js`
   - Database: PostgreSQL with pg driver
   - Authentication: JWT-based with role-based access control
   - External integrations: OpenAI API for item parsing, Discord webhooks

3. **Database**: PostgreSQL with extensive schema for game mechanics
   - Schema files: `/database/*.sql`
   - Migrations: `/backend/migrations/*.sql`
   - Key tables: users, characters, loot, item, mod, ships, crew, outposts

## Development Commands

### Frontend
```bash
cd frontend
npm install          # Install dependencies
npm start           # Start development server (port 3000)
npm run build       # Build for production
```

### Backend
```bash
cd backend
npm install          # Install dependencies
npm run dev         # Start with nodemon (auto-reload)
npm start           # Start production server
npm run migrate     # Run database migrations
```

### Docker Deployment
```bash
# Build and run full stack
docker-compose -f docker/docker-compose.yml up -d

# Update containers
./update_containers.sh
```

## Key Development Patterns

### API Structure
- Routes: `backend/src/api/routes/*.js`
- Controllers: `backend/src/controllers/*Controller.js`
- Middleware: `backend/src/middleware/*.js`
- Models: `backend/src/models/*.js` (BaseModel pattern)

### Frontend Services
- API service: `frontend/src/services/api.service.js`
- Component structure: Pages in `frontend/src/components/pages/`
- Protected routes via HOC: `frontend/src/components/hoc/`

### Database Operations
- Use parameterized queries to prevent SQL injection
- BaseModel provides CRUD operations
- Transactions for multi-table operations

## Environment Variables

Backend requires:
- `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`
- `JWT_SECRET` 
- `OPENAI_API_KEY`
- `ALLOWED_ORIGINS`

Frontend uses:
- `REACT_APP_API_URL` (set to `/api` for production)

## Current Development Focus

Based on README.md tracking:
- In Progress: Identify system, Calendar
- Modified files indicate Discord integration work
- Ship management system with status tracking (PC Active, Active, Docked, Lost, Sunk)
- Weather system integration

## Comprehensive Improvement Todo List

### 🔴 **CRITICAL PRIORITY** - Address Immediately

**Security vulnerabilities that could compromise the entire system:**

1. **Remove exposed secrets from docker-compose.yml** 
   - Location: `docker/docker-compose.yml`
   - Issue: Hard-coded database passwords and OpenAI API keys
   - Risk: Complete system compromise if file is exposed

2. **Remove hard-coded database credentials from Python utility files**
   - Location: `utilities/db_compare.py` (line 47)
   - Issue: `DB_PASSWORD = 'g5Zr7!cXw@2sP9Lk'`
   - Risk: Database access compromise

3. **Set up comprehensive testing infrastructure**
   - Current state: No test files found, test script returns error
   - Required: Jest, React Testing Library, backend testing
   - Impact: No automated testing for critical functionality

4. **Add React error boundaries to prevent UI crashes**
   - Issue: No error boundaries found in frontend
   - Impact: Unhandled errors can crash entire UI
   - Locations: Need in main App component and page components

5. **Standardize logging practices**
   - Issue: Mixed console.log/console.error with proper logger
   - Locations: Multiple backend files, especially `discord.js`
   - Fix: Replace all console usage with proper logger

### 🟡 **MEDIUM PRIORITY** - Next 2-4 weeks

**Code quality and maintainability improvements:**

6. **Set up ESLint and Prettier for code quality consistency**
   - Issue: No code quality tools configured
   - Impact: Inconsistent code style and potential bugs
   - Setup: Configure for both frontend and backend

7. **Implement API abstraction layer to reduce frontend-backend coupling**
   - Issue: Direct API calls without proper abstraction
   - Impact: Difficult to change API structure
   - Fix: Create service layer in frontend

8. **Add React performance optimizations**
   - Issue: Only 2 files use useCallback/useMemo/React.memo
   - Impact: Potential unnecessary re-renders
   - Fix: Add memoization where appropriate

9. **Remove unused dependencies and clean up dead code files**
   - Issues: 
     - Unused `crypto` package (Node.js has built-in)
     - Multiple similar database comparison scripts
     - Potentially unused `jwt-decode`
   - Impact: Clutters repository and increases bundle size

10. **Create .env.example file for proper environment documentation**
    - Issue: No documentation for required environment variables
    - Impact: Difficult deployment setup
    - Fix: Document all required variables

11. **Implement consistent API response format across all endpoints**
    - Issue: Some endpoints return different response structures
    - Impact: Frontend needs to handle multiple formats
    - Fix: Standardize response wrapper

12. **Address TODO items in code**
    - Location: `frontend/src/components/pages/DMSettings/SessionSettings.js` (line 424)
    - Issue: `TODO: Implement cancel functionality`
    - Fix: Complete unfinished functionality

### 🟢 **LOW PRIORITY** - Future enhancements

**Performance and operational improvements:**

13. **Optimize Docker images and build processes**
    - Issue: Single Dockerfile copies entire context
    - Impact: Larger image sizes than necessary
    - Fix: Multi-stage builds, .dockerignore optimization

14. **Implement caching strategy**
    - Issue: Limited caching implementation
    - Opportunity: Redis for session storage and frequently accessed data
    - Impact: Better performance for repeated queries

15. **Add comprehensive inline documentation for complex business logic**
    - Issue: Limited documentation for complex game mechanics
    - Impact: Difficult for new developers to understand system
    - Fix: JSDoc comments for complex functions

16. **Optimize bundle size and review Material-UI dependency usage**
    - Issue: Multiple Material-UI packages with potential overlap
    - Impact: Larger bundle size than necessary
    - Fix: Tree-shaking optimization, dependency audit

17. **Enhance Nginx configuration**
    - Issue: Basic configuration without optimization
    - Opportunities: Gzip compression, additional security headers
    - Impact: Better performance and security

## Code Quality Assessment

**Current Status:**
- Technical Debt Score: 6/10 (moderate, manageable with focused effort)
- Security Score: 7/10 (good foundation, but critical secrets issue)
- Maintainability Score: 7/10 (well-structured, but lacks testing)

**Strengths:**
- Good security practices (CSRF, rate limiting, input validation)
- Well-structured database schema with proper migrations
- Clean separation of concerns after lootController refactoring
- Good error handling in database operations

**Critical Issues to Address:**
- Secret management practices (items 1-2)
- Testing infrastructure (item 3)
- Error handling resilience (item 4)
- Logging consistency (item 5)

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

**Current architecture (as of latest updates):**
- Single container with Node.js backend serving both API and React frontend
- Backend runs on port 5000, serves frontend at `/` and API at `/api/*`
- No nginx layer - Node.js directly serves static files in production
- External proxy manager handles routing (not part of the application container)

### Testing Infrastructure

**Current testing setup:**
- Jest configured for both frontend and backend
- Separate unit and integration test configurations
- Database mocking for unit tests using mock functions
- Integration tests use real database connections
- Run tests with `npm test` in respective directories

### Logging Configuration

**Logger behavior:**
- Logs to files in `/app/backend/logs` when permissions allow
- Falls back to console logging if file permissions denied
- Configurable via `LOG_DIR` environment variable
- Uses winston with daily rotation

### Common Pitfalls to Avoid

1. **Don't assume column names** - Always check the actual database schema
2. **Don't change working infrastructure** - If it's working, understand why before changing
3. **Don't hardcode paths** - Use environment variables for configuration
4. **Don't ignore existing patterns** - Follow established code patterns in the codebase
5. **Don't mix concerns** - Keep frontend, backend, and database logic separated