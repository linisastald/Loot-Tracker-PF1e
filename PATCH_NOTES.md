Change Log - Version 0.8.0

Major Feature - Fleet Management System
Ship Management: Full Pathfinder 1e ship sheets with combat stats, AC, HP, movement, and armament
Ship Types: Support for Warship, Transport, Exploration vessels with auto-fill statistics
Weapon Systems: Ship weapons with quantity tracking and detailed specifications
Ship Improvements: Comprehensive modifications system with descriptions and effects
Status Tracking: PC Active, Active, Docked, Lost, Sunk status management

Major Feature - Crew Management System
Crew Recruitment: Official Skull & Shackles recruitment mechanics with skill checks
Crew Assignment: Move crew between ships and outposts with position tracking
Racial Demographics: Weighted racial generation based on Shackles region lore
Crew Status: Track active, deceased, and departed crew members
Position Management: Assign crew to Captain, First Mate, Quartermaster, and other roles

Major Feature - Outpost Management
Shore Operations: Create and manage multiple outpost locations
Crew Assignment: Station crew members at outposts for various duties
Fleet Integration: Coordinate between ship and shore-based operations

Major Feature - Infamy & Reputation System
Plunder Economy: Track plunder acquisition and spending for infamy gains
Port Relations: Manage infamy gained at different ports with threshold limits
Imposition System: Purchase special abilities and crew bonuses with disrepute
Favored Ports: Establish beneficial relationships with +2/+4/+6 skill bonuses
Sacrifice Mechanics: Crew sacrifice for disrepute gains (Despicable 20+ feature)

UI Improvement - Enhanced Loot Management
Filter Fixes: Resolved "Who Has" filter showing incorrect character data
Size Filtering: Fixed inconsistent size filter behavior with proper case handling
Field Requests: Backend now returns all necessary fields for proper filtering
Notification Badges: Real-time updates for unprocessed items and identification needs
Item Creation: Enhanced form with charges, masterwork, type, and size fields
Badge Logic: Improved sidebar notification badges for Session Tools submenu states
Gold Management: Enhanced transaction history with better filtering and "All Time" view

UI Improvement - Material-UI Modernization
TypeScript Integration: Converted major components from .js to .tsx for better type safety
Component Updates: Modern Material-UI components throughout the interface
Responsive Design: Improved mobile and tablet compatibility
Navigation: Enhanced sidebar with conditional menu items and better organization
Loading States: Better user feedback during data operations and API calls

Bug Fixes & Stability - Critical Loot Issues
Believed Value Column: Fixed displaying random character values instead of current character
Plunder Counting: Resolved infamy system showing incorrect plunder amounts (itemid vs name mismatch)
Filter Functionality: Fixed "who has" and size filters not working in loot tables
Gold Overview: Corrected displaying filtered time period instead of all-time totals
Transaction History: Fixed not showing most recent same-day transactions
Unprocessed Loot View: Resolved 500 error caused by database view column mismatches

Bug Fixes & Stability - User Experience
DM Sell Page: Added auto-refresh after sale completion with proper data fetching
Crew Movement: Enhanced ship-to-outpost crew transfer functionality
Tooltip Behavior: Removed auto-hide timeout from magic type warning tooltips
Form Validation: Improved loot creation with proper status handling (null vs 'Unprocessed')
Modal Dialogs: Fixed dialog close behavior and form state management
Sidebar Badges: Fixed Session Tools badge to show when submenu is collapsed
DatePicker Compatibility: Resolved MUI X DatePicker accessibility structure errors
Gold Entry Validation: Fixed datetime format validation for loot entry form submissions
Gold Transaction History: Added "All Time" quick filter and improved date range handling
API Response Handling: Fixed paginated response structure parsing in gold transactions

Bug Fixes & Stability - Security & Performance
Credential Management: Removed hard-coded passwords from Docker compose files
Database Security: Enhanced SQL injection prevention and input sanitization
Authentication: Improved JWT token handling and session management
Error Handling: Better error message sanitization and graceful degradation
Memory Management: Optimized long-running processes and prevented memory leaks

Technical Improvements - Infrastructure
Docker Optimization: Faster builds, startup times, and improved container architecture
Migration System: Automatic database updates on deployment with rollback support
Logging Framework: Comprehensive application logging with rotation and configurable paths
Build System: Enhanced development and production build processes
Database Performance: Optimized queries and improved indexing strategies

Technical Improvements - Development Experience
Test Infrastructure: Comprehensive testing suite with Jest and React Testing Library
Code Coverage: Improved test coverage from 1.33% to 5.71% across the application
CI/CD Pipeline: GitHub Actions workflows for automated testing and quality checks
TypeScript Support: Enhanced type safety and development experience
Code Quality: Improved linting, formatting, and pre-commit hook standards

Data Management - Calendar & Weather Integration
Golarion Calendar: Full integration with Pathfinder timeline and session dating
Weather System: Regional weather tracking with seasonal variations
Time Management: Proper chronological organization of events and sessions
Date Consistency: Fixed 1-indexed month handling throughout the system

Data Management - Enhanced Validation
Item Processing: Improved item creation with all Pathfinder 1e fields
Data Integrity: Enhanced validation and error handling across all forms
API Standardization: Consistent response formats and error handling
Field Mapping: Proper handling of legacy vs new data structures