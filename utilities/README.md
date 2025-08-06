# Database Utilities

This directory contains consolidated database management utilities for the Loot Tracker application.

## Database Manager

The `database_manager.py` script consolidates the functionality of the following individual scripts that were previously in the root directory:

- `db_compare.py` - Database structure comparison and analysis
- `db_sync.py` - Complete database synchronization with Docker containers  
- `db_lookup_resolver.py` - Interactive conflict resolution for lookup tables
- `db_update.py` - Structural updates and modifications
- `db_content_compare.py` - Content comparison and synchronization

### Features

- **Structure Comparison**: Compare database schemas between master and container databases
- **Database Synchronization**: Full sync of structures, data, and lookup tables across Docker containers
- **Conflict Resolution**: Interactive resolution of conflicting data in lookup tables
- **Content Comparison**: Compare and sync table content between databases
- **Docker Integration**: Automatic discovery and management of Docker containers
- **Dry Run Support**: Preview changes before execution
- **Transaction Safety**: All operations wrapped in transactions with rollback on errors

### Configuration

The database manager uses the following configuration sources (in order of precedence):

1. Environment variables
2. `config.ini` file in the project root
3. Default values

#### Required Environment Variables

```bash
export DB_PASSWORD="your_database_password"
```

#### Optional Configuration

```bash
export DB_HOST="localhost"
export DB_NAME="loot_tracking" 
export DB_USER="loot_user"
export MASTER_PORT="5432"
export CONTAINER_FILTER="loot_db"
```

#### Config File Format (config.ini)

```ini
[Database]
DB_HOST = localhost
DB_NAME = loot_tracking
DB_USER = loot_user
DB_PASSWORD = your_password
MASTER_PORT = 5432
CONTAINER_FILTER = loot_db
TABLES_TO_COMPARE = impositions,item,mod,spells
```

### Usage

#### Structure Comparison

Compare database structures between master and containers:

```bash
python utilities/database_manager.py compare --verbose
```

#### Database Synchronization

Synchronize all databases (structure + data + lookup tables):

```bash
# Dry run to see what would be changed
python utilities/database_manager.py sync --dry-run --verbose

# Execute synchronization
python utilities/database_manager.py sync --verbose
```

#### Conflict Resolution

Interactively resolve conflicts in lookup tables:

```bash
python utilities/database_manager.py resolve --verbose
```

#### Content Comparison

Compare and sync table content:

```bash
# Compare specific tables
python utilities/database_manager.py content --tables item,mod --dry-run

# Compare all configured tables
python utilities/database_manager.py content --verbose
```

### Architecture

The database manager is organized into several classes:

- **DatabaseConfig**: Configuration management and validation
- **DockerManager**: Docker container discovery and port management
- **DatabaseConnection**: Connection management with retry logic
- **DatabaseStructure**: Schema analysis and comparison
- **DatabaseSync**: Complete database synchronization
- **ConflictResolver**: Interactive conflict resolution
- **ContentComparator**: Content comparison and synchronization
- **DatabaseManager**: Main orchestrator class

### Lookup Tables

The system recognizes the following lookup tables with their key fields:

- `impositions`: keyed by `name`
- `item`: keyed by `name` + `type`
- `min_caster_levels`: keyed by `spell_level` + `item_type`
- `min_costs`: keyed by `spell_level`
- `mod`: keyed by `name` + `type`
- `spells`: keyed by `name`
- `weather_regions`: keyed by `region_name`

### Contributing Tables

These tables contribute new data back to the master database:

- `item`
- `mod`

### Reference Tables

Tables that reference lookup table IDs:

- `loot`: references `item` (via `itemid`) and `mod` (via `modids` array)

### Error Handling

- All database operations are wrapped in transactions
- Connection failures include automatic retry logic
- Comprehensive logging at different verbosity levels
- Graceful handling of missing containers or connection failures

### Security

⚠️ **Important**: Never commit database passwords to version control. Always use environment variables or external configuration files that are not tracked by git.

### Migration from Individual Scripts

If you were previously using the individual database scripts, you can now use the consolidated database manager:

- `db_compare.py` → `python utilities/database_manager.py compare`
- `db_sync.py` → `python utilities/database_manager.py sync`
- `db_lookup_resolver.py` → `python utilities/database_manager.py resolve`
- `db_update.py` → `python utilities/database_manager.py update` (structure updates are included in sync)
- `db_content_compare.py` → `python utilities/database_manager.py content`

The individual scripts can be safely removed once the consolidated manager is fully tested and deployed.

## Other Utilities

This directory also contains various other Python utilities for database management and data processing:

- `aonsearch.py` - Archives of Nethys search functionality
- `itemsearch.py` - Item search utilities
- `itemupdate.py` - Item update operations
- `generate_test_data.sql` - Test data generation
- `update_mod_caster_levels.py` - Caster level updates for modifications

## Environment Variables Required

All Python scripts in this directory require the following environment variable:

- `DB_PASSWORD`: The database password for connecting to PostgreSQL

## Setting Environment Variables

### Windows (Command Prompt)
```cmd
set DB_PASSWORD=your_password_here
python script_name.py
```

### Windows (PowerShell)  
```powershell
$env:DB_PASSWORD="your_password_here"
python script_name.py
```

### Linux/Mac
```bash
export DB_PASSWORD=your_password_here
python script_name.py
```

### Using .env file
Create a `.env` file in the project root with:
```
DB_PASSWORD=your_password_here
```

Then the scripts will automatically load it using python-dotenv.

## Security Note

Never commit passwords or sensitive data to version control. Always use environment variables for credentials.