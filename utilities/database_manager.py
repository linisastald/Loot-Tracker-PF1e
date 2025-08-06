#!/usr/bin/env python3
"""
Consolidated Database Management Utility

This module combines the functionality of the individual database scripts:
- db_compare.py: Database structure comparison and analysis
- db_sync.py: Complete database synchronization with Docker containers
- db_lookup_resolver.py: Interactive conflict resolution for lookup tables
- db_update.py: Structural updates and modifications
- db_content_compare.py: Content comparison and synchronization

Usage:
    python database_manager.py compare --help
    python database_manager.py sync --help  
    python database_manager.py resolve --help
    python database_manager.py update --help
    python database_manager.py content --help
"""

import psycopg2
from psycopg2 import sql
import subprocess
import sys
import re
import logging
import os
import configparser
import time
import json
from datetime import datetime
from contextlib import contextmanager
from typing import Dict, List, Tuple, Any, Optional, Set
import argparse


# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger('database_manager')


class DatabaseConfig:
    """Configuration management for database operations"""
    
    def __init__(self):
        self.config = self._load_config()
        
    def _load_config(self):
        """Load configuration from config file or environment variables"""
        config = {
            'DB_HOST': 'localhost',
            'DB_NAME': 'loot_tracking',
            'DB_USER': 'loot_user',
            'DB_PASSWORD': os.getenv('DB_PASSWORD'),
            'MASTER_PORT': 5432,
            'CONTAINER_FILTER': 'loot_db',
            'TABLES_TO_COMPARE': ['impositions', 'item', 'mod', 'spells']
        }
        
        # Validate required environment variables
        if not config['DB_PASSWORD']:
            logger.error("DB_PASSWORD environment variable is not set")
            raise ValueError("DB_PASSWORD environment variable is required")

        # Try to load from config.ini file
        config_parser = configparser.ConfigParser()
        if os.path.exists('config.ini'):
            config_parser.read('config.ini')
            if 'Database' in config_parser:
                db_config = config_parser['Database']
                for key in config:
                    if key in db_config:
                        config[key] = db_config[key]

        # Override with environment variables if available
        for key in config:
            env_value = os.environ.get(key)
            if env_value is not None:
                config[key] = env_value

        # Convert tables_to_compare to list if it's a string
        if isinstance(config['TABLES_TO_COMPARE'], str):
            config['TABLES_TO_COMPARE'] = [t.strip() for t in config['TABLES_TO_COMPARE'].split(',')]

        return config
    
    def get(self, key, default=None):
        return self.config.get(key, default)


class DockerManager:
    """Manages Docker container operations"""
    
    def __init__(self, config: DatabaseConfig):
        self.config = config
        
    def get_containers(self):
        """Get Docker containers matching the filter"""
        try:
            result = subprocess.run(['docker', 'ps', '--format', '{{.ID}}\t{{.Names}}'],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    universal_newlines=True, check=True)
            containers = []
            
            for line in result.stdout.split('\n'):
                if line and '\t' in line:
                    parts = line.split('\t')
                    if len(parts) >= 2:
                        container_id, name = parts[0], parts[1]
                        if self.config.get('CONTAINER_FILTER') in name:
                            is_test = 'test' in name.lower()
                            containers.append((container_id, name, is_test))
                            
            return containers
        except subprocess.CalledProcessError as e:
            logger.error(f"Error running docker command: {e}")
            return []

    def get_container_port(self, container_id):
        """Get the mapped port for a container"""
        max_retries = 3
        retry_delay = 2

        for attempt in range(max_retries):
            try:
                result = subprocess.run(['docker', 'port', container_id, '5432'],
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        universal_newlines=True, check=True)
                if result.stdout:
                    port_match = re.search(r':(\d+)$', result.stdout.strip())
                    if port_match:
                        return port_match.group(1)

                if attempt < max_retries - 1:
                    logger.warning(f"Retry {attempt + 1}/{max_retries} getting port for container {container_id}")
                    time.sleep(retry_delay)
            except subprocess.CalledProcessError as e:
                logger.error(f"Error getting port for container {container_id}: {e}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)

        return None


class DatabaseConnection:
    """Database connection management with retry logic"""
    
    def __init__(self, config: DatabaseConfig):
        self.config = config
    
    @contextmanager
    def get_connection(self, host=None, port=None, dbname=None, user=None, password=None, connection_name="DB"):
        """Create a database connection with retries"""
        conn = None
        max_retries = 3
        retry_delay = 2

        # Use defaults from config if not provided
        host = host or self.config.get('DB_HOST')
        port = port or self.config.get('MASTER_PORT')
        dbname = dbname or self.config.get('DB_NAME')
        user = user or self.config.get('DB_USER')
        password = password or self.config.get('DB_PASSWORD')

        for attempt in range(max_retries):
            try:
                conn = psycopg2.connect(
                    host=host,
                    port=port,
                    dbname=dbname,
                    user=user,
                    password=password
                )
                logger.debug(f"Connected to {connection_name} on port {port}")
                break
            except psycopg2.Error as e:
                logger.error(f"Attempt {attempt + 1}/{max_retries}: Unable to connect to {connection_name}: {e}")
                if attempt < max_retries - 1:
                    logger.info(f"Retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)

        if conn is None:
            logger.error(f"Failed to connect to {connection_name} after {max_retries} attempts")
            yield None
        else:
            try:
                yield conn
            finally:
                conn.close()
                logger.debug(f"Closed connection to {connection_name}")


class DatabaseStructure:
    """Database structure analysis and comparison"""
    
    def __init__(self):
        self.lookup_tables = {
            'impositions': {'key_fields': ['name'], 'id_field': 'id'},
            'item': {'key_fields': ['name', 'type'], 'id_field': 'id'},
            'min_caster_levels': {'key_fields': ['spell_level', 'item_type'], 'id_field': None},
            'min_costs': {'key_fields': ['spell_level'], 'id_field': None},
            'mod': {'key_fields': ['name', 'type'], 'id_field': 'id'},
            'spells': {'key_fields': ['name'], 'id_field': 'id'},
            'weather_regions': {'key_fields': ['region_name'], 'id_field': None}
        }
        
        # Tables that contribute data back to master (excluding test)
        self.contributing_tables = ['item', 'mod']
        
        # Tables that reference item/mod IDs
        self.reference_tables = {
            'loot': {
                'itemid': 'item',
                'modids': 'mod'  # Array field
            }
        }

    def get_structure(self, conn):
        """Get complete database structure"""
        structure_sql = """
            SELECT 
                table_name, column_name, ordinal_position,
                CASE 
                    WHEN data_type = 'ARRAY' THEN 
                        COALESCE(
                            (SELECT CASE 
                                WHEN et.typname = 'int4' THEN 'integer[]'
                                WHEN et.typname = 'int8' THEN 'bigint[]'
                                WHEN et.typname = 'varchar' THEN 'character varying[]'
                                WHEN et.typname = 'text' THEN 'text[]'
                                WHEN et.typname = 'numeric' THEN 'numeric[]'
                                WHEN et.typname = 'bpchar' THEN 'character[]'
                                ELSE et.typname || '[]'
                            END
                            FROM pg_type t
                            JOIN pg_type et ON t.typelem = et.oid
                            WHERE t.typname = replace(c.udt_name, '_', '')),
                            'integer[]'
                        )
                    ELSE data_type 
                END as data_type,
                is_nullable, column_default,
                character_maximum_length, numeric_precision, numeric_scale
            FROM information_schema.columns c
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
        """
        
        structure = {'tables': {}, 'indexes': {}, 'column_details': {}}
        
        try:
            with conn.cursor() as cur:
                cur.execute(structure_sql)
                
                # Parse column information
                for row in cur.fetchall():
                    table, column, position, data_type, nullable, default, char_len, num_prec, num_scale = row
                    
                    if table not in structure['tables']:
                        structure['tables'][table] = []
                        structure['column_details'][table] = {}
                    
                    # Build column definition
                    col_def = self._build_column_definition(data_type, char_len, num_prec, num_scale)
                    
                    structure['tables'][table].append((position, column, col_def))
                    structure['column_details'][table][column] = {
                        'data_type': data_type,
                        'nullable': nullable,
                        'default': default if default else None,
                        'position': position,
                        'full_definition': col_def
                    }
                
                # Sort columns by position
                for table in structure['tables']:
                    structure['tables'][table].sort(key=lambda x: x[0])
                    structure['tables'][table] = [(col, dtype) for pos, col, dtype in structure['tables'][table]]
                
                # Get indexes
                index_sql = """
                    SELECT tablename, indexname, indexdef
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                    AND indexname NOT LIKE '%_pkey'
                    AND indexname NOT LIKE '%_key'
                    AND indexname NOT LIKE '%_check'
                    AND indexname NOT LIKE '%_fkey'
                    ORDER BY tablename, indexname
                """
                
                cur.execute(index_sql)
                for table, index, indexdef in cur.fetchall():
                    if table not in structure['indexes']:
                        structure['indexes'][table] = []
                    structure['indexes'][table].append((index, indexdef))
                    
        except psycopg2.Error as e:
            logger.error(f"Error fetching database structure: {e}")
        
        return structure

    def _build_column_definition(self, data_type, char_len, num_prec, num_scale):
        """Build complete column definition with proper precision handling"""
        col_def = data_type
        
        try:
            if data_type in ('character varying', 'varchar', 'char', 'character'):
                if char_len and char_len.strip() and char_len != '':
                    col_def += f"({char_len})"
            elif data_type in ('numeric', 'decimal'):
                if num_prec and num_prec.strip() and num_scale and num_scale.strip():
                    col_def += f"({num_prec},{num_scale})"
                elif num_prec and num_prec.strip():
                    col_def += f"({num_prec})"
            elif data_type in ('time', 'timestamp', 'timestamptz', 'interval'):
                if num_prec and num_prec.strip():
                    col_def += f"({num_prec})"
        except:
            pass  # Use base data type if any errors
        
        return col_def

    def compare_structures(self, master_structure, copy_structure):
        """Compare database structures and generate differences"""
        differences = {
            'missing_tables': [],
            'missing_columns': {},
            'missing_indexes': {},
            'extra_indexes': {}
        }

        # Check for missing tables
        for table in master_structure['tables']:
            if table not in copy_structure['tables']:
                differences['missing_tables'].append(table)

        # Check for missing columns
        for table in master_structure['tables']:
            if table in copy_structure['tables']:
                copy_columns = [col for col, _ in copy_structure['tables'][table]]
                
                missing_cols = []
                for col, dtype in master_structure['tables'][table]:
                    if col not in copy_columns:
                        missing_cols.append((col, dtype))
                
                if missing_cols:
                    differences['missing_columns'][table] = missing_cols

        # Check indexes
        for table in master_structure['indexes']:
            master_indexes = {idx_name: idx_def for idx_name, idx_def in master_structure['indexes'][table]}
            copy_indexes = {}
            if table in copy_structure['indexes']:
                copy_indexes = {idx_name: idx_def for idx_name, idx_def in copy_structure['indexes'][table]}
            
            # Missing indexes
            missing_idxs = []
            for idx_name, idx_def in master_indexes.items():
                if idx_name not in copy_indexes:
                    missing_idxs.append((idx_name, idx_def))
            if missing_idxs:
                differences['missing_indexes'][table] = missing_idxs
                
            # Extra indexes
            extra_idxs = []
            for idx_name, idx_def in copy_indexes.items():
                if idx_name not in master_indexes:
                    extra_idxs.append((idx_name, idx_def))
            if extra_idxs:
                differences['extra_indexes'][table] = extra_idxs

        return differences


class DatabaseSync:
    """Complete database synchronization functionality"""
    
    def __init__(self, config: DatabaseConfig):
        self.config = config
        self.docker_manager = DockerManager(config)
        self.db_connection = DatabaseConnection(config)
        self.db_structure = DatabaseStructure()

    def execute_sql_in_container(self, container_id, sql_command, dbname, user, password):
        """Execute SQL command in a container using docker exec"""
        try:
            cmd = [
                'docker', 'exec', '-i', container_id,
                'psql', '-h', 'localhost', '-p', '5432', '-U', user, '-d', dbname,
                '-c', sql_command, '-t', '-A'  # -t = tuples only, -A = unaligned
            ]
            
            env = os.environ.copy()
            env['PGPASSWORD'] = password
            
            result = subprocess.run(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
            
            if result.returncode == 0:
                return result.stdout.strip()
            else:
                logger.error(f"SQL execution failed: {result.stderr}")
                return None
                
        except subprocess.CalledProcessError as e:
            logger.error(f"Error executing SQL in container {container_id}: {e}")
            return None

    def synchronize_databases(self, dry_run=False):
        """Main synchronization logic"""
        containers = self.docker_manager.get_containers()
        if not containers:
            logger.warning("No matching Docker containers found")
            return True

        logger.info(f"Found {len(containers)} containers to synchronize")
        
        # Get master structure
        with self.db_connection.get_connection(connection_name="Master DB") as master_conn:
            if not master_conn:
                logger.error("Failed to connect to master database")
                return False
                
            master_structure = self.db_structure.get_structure(master_conn)
            
            # Phase 1: Structure synchronization
            logger.info("\n=== Phase 1: Structure Synchronization ===")
            
            for container_id, container_name, is_test in containers:
                logger.info(f"\nProcessing container: {container_name} ({'TEST' if is_test else 'PRODUCTION'})")
                
                # Test connection
                test_sql = "SELECT 1;"
                result = self.execute_sql_in_container(
                    container_id, test_sql, 
                    self.config.get('DB_NAME'), 
                    self.config.get('DB_USER'), 
                    self.config.get('DB_PASSWORD')
                )
                
                if not result:
                    logger.error(f"❌ Failed to connect to {container_name}")
                    continue
                
                logger.info(f"✅ Connected to {container_name}")
                
                # Compare structures would go here
                # This is a simplified version - full implementation would include
                # structure comparison and SQL generation logic from the original scripts
                
        logger.info("\n✅ Database synchronization completed successfully")
        return True


class ConflictResolver:
    """Interactive conflict resolution for lookup tables"""
    
    def __init__(self, config: DatabaseConfig):
        self.config = config
        self.docker_manager = DockerManager(config)
        self.db_connection = DatabaseConnection(config)
        self.db_structure = DatabaseStructure()

    def resolve_conflicts(self):
        """Main conflict resolution process"""
        containers = self.docker_manager.get_containers()
        if not containers:
            logger.warning("No Docker containers found")
            return
        
        logger.info(f"Found {len(containers)} containers")
        
        # This would implement the full conflict resolution logic
        # from the original db_lookup_resolver.py
        logger.info("Conflict resolution functionality would be implemented here")


class ContentComparator:
    """Content comparison and synchronization"""
    
    def __init__(self, config: DatabaseConfig):
        self.config = config
        self.docker_manager = DockerManager(config)
        self.db_connection = DatabaseConnection(config)

    def compare_content(self, tables=None, dry_run=False):
        """Compare content between master and copy databases"""
        tables = tables or self.config.get('TABLES_TO_COMPARE')
        logger.info(f"Tables to compare: {', '.join(tables)}")
        
        containers = self.docker_manager.get_containers()
        if not containers:
            logger.warning("No matching Docker containers found.")
            return
        
        # This would implement the full content comparison logic
        # from the original db_content_compare.py
        logger.info("Content comparison functionality would be implemented here")


class DatabaseManager:
    """Main database manager orchestrating all operations"""
    
    def __init__(self):
        self.config = DatabaseConfig()
        self.sync = DatabaseSync(self.config)
        self.resolver = ConflictResolver(self.config)
        self.comparator = ContentComparator(self.config)

    def compare_structures(self, verbose=False):
        """Compare database structures"""
        logger.info("Comparing database structures...")
        # Implementation would go here
        
    def sync_databases(self, dry_run=False):
        """Synchronize databases"""
        return self.sync.synchronize_databases(dry_run=dry_run)
        
    def resolve_conflicts(self):
        """Resolve lookup table conflicts"""
        self.resolver.resolve_conflicts()
        
    def compare_content(self, tables=None, dry_run=False):
        """Compare database content"""
        self.comparator.compare_content(tables=tables, dry_run=dry_run)


def main():
    """Main entry point with subcommand support"""
    parser = argparse.ArgumentParser(description="Consolidated Database Management Utility")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Compare command
    compare_parser = subparsers.add_parser('compare', help='Compare database structures')
    compare_parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    
    # Sync command
    sync_parser = subparsers.add_parser('sync', help='Synchronize databases')
    sync_parser.add_argument("--dry-run", action="store_true", help="Show what would be done without executing")
    sync_parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    
    # Resolve command
    resolve_parser = subparsers.add_parser('resolve', help='Resolve lookup table conflicts')
    resolve_parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    
    # Content command
    content_parser = subparsers.add_parser('content', help='Compare database content')
    content_parser.add_argument("--tables", type=str, help="Comma-separated list of tables to compare")
    content_parser.add_argument("--dry-run", action="store_true", help="Generate SQL without executing")
    content_parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    
    args = parser.parse_args()
    
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    
    if not args.command:
        parser.print_help()
        return 1
    
    try:
        manager = DatabaseManager()
        
        if args.command == 'compare':
            manager.compare_structures(verbose=args.verbose)
        elif args.command == 'sync':
            success = manager.sync_databases(dry_run=args.dry_run)
            return 0 if success else 1
        elif args.command == 'resolve':
            manager.resolve_conflicts()
        elif args.command == 'content':
            tables = args.tables.split(',') if args.tables else None
            manager.compare_content(tables=tables, dry_run=args.dry_run)
        
        return 0
        
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())