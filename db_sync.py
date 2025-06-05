#!/usr/bin/env python3

import subprocess
import sys
import re
import logging
import os
import configparser
import time
import json
from datetime import datetime
import csv
import io
from typing import Dict, List, Tuple, Any, Optional

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger('db_sync')

class DatabaseSync:
    def __init__(self, config):
        self.config = config
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

    def load_config(self):
        """Load configuration from config file or environment variables"""
        config = {
            'DB_HOST': 'localhost',
            'DB_NAME': 'loot_tracking',
            'DB_USER': 'loot_user',
            'DB_PASSWORD': 'g5Zr7!cXw@2sP9Lk',
            'MASTER_PORT': 5432,
            'CONTAINER_FILTER': 'loot_db'
        }

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

        return config

    def get_docker_containers(self):
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
                        if self.config['CONTAINER_FILTER'] in name:
                            is_test = 'test' in name.lower()
                            containers.append((container_id, name, is_test))
                            
            return containers
        except subprocess.CalledProcessError as e:
            logger.error(f"Error running docker command: {e}")
            return []

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

    def execute_sql_on_host(self, sql_command, host, port, dbname, user, password):
        """Execute SQL command on host database"""
        try:
            cmd = [
                'psql', '-h', host, '-p', str(port), '-U', user, '-d', dbname,
                '-c', sql_command, '-t', '-A'
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
            logger.error(f"Error executing SQL on host: {e}")
            return None

    def get_database_structure(self, container_id=None, host=None, port=None, dbname=None, user=None, password=None):
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
        
        # Execute query
        if container_id:
            result = self.execute_sql_in_container(container_id, structure_sql, dbname, user, password)
        else:
            result = self.execute_sql_on_host(structure_sql, host, port, dbname, user, password)
        
        if not result:
            return {'tables': {}, 'indexes': {}, 'column_details': {}}
        
        structure = {'tables': {}, 'indexes': {}, 'column_details': {}}
        
        # Parse column information
        for line in result.split('\n'):
            if line.strip():
                parts = line.split('|')
                if len(parts) >= 9:
                    table, column, position, data_type, nullable, default, char_len, num_prec, num_scale = parts[:9]
                    
                    if table not in structure['tables']:
                        structure['tables'][table] = []
                        structure['column_details'][table] = {}
                    
                    # Build column definition
                    col_def = self._build_column_definition(data_type, char_len, num_prec, num_scale)
                    
                    try:
                        position = int(position)
                    except ValueError:
                        position = 0
                    
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
            ORDER BY tablename, indexname
        """
        
        if container_id:
            index_result = self.execute_sql_in_container(container_id, index_sql, dbname, user, password)
        else:
            index_result = self.execute_sql_on_host(index_sql, host, port, dbname, user, password)
        
        if index_result:
            for line in index_result.split('\n'):
                if line.strip():
                    parts = line.split('|')
                    if len(parts) >= 3:
                        table, index, indexdef = parts[:3]
                        if table not in structure['indexes']:
                            structure['indexes'][table] = []
                        structure['indexes'][table].append((index, indexdef))
        
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

    def generate_structure_sql(self, differences, master_structure):
        """Generate SQL to fix structural differences"""
        sql_statements = []
        
        # Create missing tables
        for table in differences['missing_tables']:
            columns = master_structure['tables'].get(table, [])
            column_definitions = []
            
            for column, data_type in columns:
                col_info = master_structure['column_details'][table][column]
                quoted_column = f'"{column}"'
                col_def = f"{quoted_column} {col_info['full_definition']}"
                
                if col_info['nullable'] == 'NO':
                    col_def += " NOT NULL"
                if col_info['default']:
                    col_def += f" DEFAULT {self._format_default(col_info['default'])}"
                    
                column_definitions.append(col_def)

            quoted_table = f'"{table}"'
            sql_statements.append(f"CREATE TABLE {quoted_table} ({', '.join(column_definitions)});")

        # Add missing columns
        for table, columns in differences['missing_columns'].items():
            for column, data_type in columns:
                col_info = master_structure['column_details'][table][column]
                quoted_table = f'"{table}"'
                quoted_column = f'"{column}"'
                col_def = col_info['full_definition']
                
                if col_info['nullable'] == 'NO':
                    col_def += " NOT NULL"
                if col_info['default']:
                    col_def += f" DEFAULT {self._format_default(col_info['default'])}"
                    
                sql_statements.append(f"ALTER TABLE {quoted_table} ADD COLUMN {quoted_column} {col_def};")

        # Drop extra indexes
        for table, indexes in differences['extra_indexes'].items():
            for idx_name, idx_def in indexes:
                quoted_idx = f'"{idx_name}"'
                sql_statements.append(f"DROP INDEX IF EXISTS {quoted_idx};")

        # Create missing indexes
        for table, indexes in differences['missing_indexes'].items():
            for idx_name, idx_def in indexes:
                if 'CREATE INDEX' in idx_def and 'IF NOT EXISTS' not in idx_def:
                    idx_def = idx_def.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS', 1)
                elif 'CREATE UNIQUE INDEX' in idx_def and 'IF NOT EXISTS' not in idx_def:
                    idx_def = idx_def.replace('CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS', 1)
                sql_statements.append(f"{idx_def};")

        return sql_statements

    def _format_default(self, default_val):
        """Format default values for SQL statements"""
        if not default_val or default_val.strip() == '':
            return "NULL"
        if default_val.startswith('nextval('):
            return default_val
        elif default_val.upper() in ('CURRENT_TIMESTAMP', 'NOW()'):
            return default_val
        elif '::' in default_val:
            return default_val
        elif default_val.startswith('ARRAY['):
            return default_val
        elif default_val.startswith("'") and default_val.endswith("'"):
            return default_val
        elif default_val.replace('.', '').replace('-', '').isdigit():
            return default_val
        else:
            return f"'{default_val.replace(chr(39), chr(39)+chr(39))}'"

    def get_table_data(self, container_id=None, host=None, port=None, dbname=None, user=None, password=None, table=None):
        """Get all data from a table"""
        quoted_table = f'"{table}"'
        data_sql = f"SELECT * FROM {quoted_table}"
        
        if container_id:
            result = self.execute_sql_in_container(container_id, data_sql, dbname, user, password)
        else:
            result = self.execute_sql_on_host(data_sql, host, port, dbname, user, password)
        
        if not result:
            return [], []
        
        # Get column names
        columns_sql = f"""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = '{table}' AND table_schema = 'public'
            ORDER BY ordinal_position
        """
        
        if container_id:
            columns_result = self.execute_sql_in_container(container_id, columns_sql, dbname, user, password)
        else:
            columns_result = self.execute_sql_on_host(columns_sql, host, port, dbname, user, password)
        
        columns = []
        if columns_result:
            columns = [line.strip() for line in columns_result.split('\n') if line.strip()]
        
        # Parse data rows
        rows = []
        for line in result.split('\n'):
            if line.strip():
                # Handle PostgreSQL array format and other data types
                parts = line.split('|')
                row = []
                for part in parts:
                    if part == '':
                        row.append(None)
                    elif part.startswith('{') and part.endswith('}'):
                        # PostgreSQL array
                        array_content = part[1:-1]
                        if array_content:
                            row.append([item.strip('"') for item in array_content.split(',')])
                        else:
                            row.append([])
                    else:
                        row.append(part)
                rows.append(tuple(row))
        
        return columns, rows

    def build_lookup_key(self, row_dict, table):
        """Build a lookup key for a table row based on key fields"""
        key_fields = self.lookup_tables[table]['key_fields']
        key_values = []
        
        for field in key_fields:
            value = row_dict.get(field)
            if value is None:
                key_values.append('NULL')
            else:
                key_values.append(str(value))
        
        return '|'.join(key_values)

    def find_new_rows(self, master_data, copy_data, table):
        """Find rows in copy that don't exist in master"""
        master_columns, master_rows = master_data
        copy_columns, copy_rows = copy_data
        
        # Build master lookup
        master_lookup = {}
        for row in master_rows:
            row_dict = dict(zip(master_columns, row))
            lookup_key = self.build_lookup_key(row_dict, table)
            master_lookup[lookup_key] = row_dict
        
        # Find new rows in copy
        new_rows = []
        for row in copy_rows:
            row_dict = dict(zip(copy_columns, row))
            lookup_key = self.build_lookup_key(row_dict, table)
            
            if lookup_key not in master_lookup:
                # Reorder to match master column order
                reordered_row = []
                for col in master_columns:
                    reordered_row.append(row_dict.get(col))
                new_rows.append(tuple(reordered_row))
        
        return new_rows

    def generate_insert_sql(self, table, columns, rows):
        """Generate INSERT statements for new rows"""
        if not rows:
            return []

        # Check if this table has an auto-generated ID field
        exclude_id = table in self.lookup_tables and self.lookup_tables[table]['id_field']
        
        # Filter out ID column if it's auto-generated
        if exclude_id:
            id_field = self.lookup_tables[table]['id_field']
            insert_columns = [col for col in columns if col != id_field]
        else:
            insert_columns = columns

        sql_statements = []
        quoted_table = f'"{table}"'
        quoted_columns = [f'"{col}"' for col in insert_columns]
        column_names = ', '.join(quoted_columns)
        
        for row in rows:
            # Build values excluding ID if auto-generated
            if exclude_id:
                id_field = self.lookup_tables[table]['id_field']
                try:
                    id_index = columns.index(id_field)
                    values_data = [val for i, val in enumerate(row) if i != id_index]
                except ValueError:
                    values_data = row
            else:
                values_data = row
                
            values = []
            for val in values_data:
                if val is None:
                    values.append("NULL")
                elif isinstance(val, str):
                    values.append(f"'{val.replace(chr(39), chr(39)+chr(39))}'")
                elif isinstance(val, list):
                    # Handle PostgreSQL arrays
                    if not val:
                        values.append("ARRAY[]::text[]")
                    else:
                        array_elements = []
                        for element in val:
                            if element is None:
                                array_elements.append("NULL")
                            elif isinstance(element, str):
                                array_elements.append(f"'{element.replace(chr(39), chr(39)+chr(39))}'")
                            else:
                                array_elements.append(str(element))
                        values.append(f"ARRAY[{', '.join(array_elements)}]")
                elif isinstance(val, bool):
                    values.append(str(val).upper())
                else:
                    values.append(str(val))
            
            values_str = ', '.join(values)
            sql_statements.append(f"INSERT INTO {quoted_table} ({column_names}) VALUES ({values_str});")
        
        return sql_statements

    def execute_sql_transaction_in_container(self, container_id, sql_statements, description, dbname, user, password, dry_run=False):
        """Execute multiple SQL statements in a transaction within a container"""
        if not sql_statements:
            logger.info(f"No {description} changes to execute")
            return True
        
        if dry_run:
            logger.info(f"DRY RUN - Would execute {len(sql_statements)} {description} statements:")
            for i, statement in enumerate(sql_statements[:5], 1):  # Show first 5 statements
                logger.info(f"  {i}. {statement}")
            if len(sql_statements) > 5:
                logger.info(f"  ... and {len(sql_statements) - 5} more statements")
            return True
            
        try:
            # Combine all statements into a single transaction
            transaction_sql = "BEGIN; " + " ".join(sql_statements) + " COMMIT;"
            
            result = self.execute_sql_in_container(container_id, transaction_sql, dbname, user, password)
            
            if result is not None:
                logger.info(f"Successfully executed {len(sql_statements)} {description} statements")
                return True
            else:
                logger.error(f"Failed to execute {description} statements")
                return False
                
        except Exception as e:
            logger.error(f"Error executing {description}: {e}")
            return False

    def execute_sql_transaction_on_host(self, sql_statements, description, host, port, dbname, user, password, dry_run=False):
        """Execute multiple SQL statements in a transaction on host"""
        if not sql_statements:
            logger.info(f"No {description} changes to execute")
            return True
        
        if dry_run:
            logger.info(f"DRY RUN - Would execute {len(sql_statements)} {description} statements:")
            for i, statement in enumerate(sql_statements[:5], 1):  # Show first 5 statements
                logger.info(f"  {i}. {statement}")
            if len(sql_statements) > 5:
                logger.info(f"  ... and {len(sql_statements) - 5} more statements")
            return True
            
        try:
            # Combine all statements into a single transaction
            transaction_sql = "BEGIN; " + " ".join(sql_statements) + " COMMIT;"
            
            result = self.execute_sql_on_host(transaction_sql, host, port, dbname, user, password)
            
            if result is not None:
                logger.info(f"Successfully executed {len(sql_statements)} {description} statements")
                return True
            else:
                logger.error(f"Failed to execute {description} statements")
                return False
                
        except Exception as e:
            logger.error(f"Error executing {description}: {e}")
            return False

    def sync_lookup_data(self, master_data, copy_data, table):
        """Synchronize lookup table data from master to copy"""
        if not master_data[0]:  # No columns
            return []
        
        # Build copy lookup
        copy_columns, copy_rows = copy_data
        copy_lookup = set()
        
        for row in copy_rows:
            row_dict = dict(zip(copy_columns, row))
            lookup_key = self.build_lookup_key(row_dict, table)
            copy_lookup.add(lookup_key)
        
        # Find missing rows in copy
        master_columns, master_rows = master_data
        missing_rows = []
        
        for row in master_rows:
            row_dict = dict(zip(master_columns, row))
            lookup_key = self.build_lookup_key(row_dict, table)
            
            if lookup_key not in copy_lookup:
                missing_rows.append(row)
        
        if missing_rows:
            logger.info(f"Found {len(missing_rows)} missing rows in {table}")
            return self.generate_insert_sql(table, master_columns, missing_rows)
        
        return []

    def format_summary_table(self, data, headers):
        """Format summary data as a table"""
        if not data:
            return "No changes found"
        
        # Calculate column widths
        col_widths = [len(str(header)) for header in headers]
        for row in data:
            for i, cell in enumerate(row):
                if i < len(col_widths):
                    col_widths[i] = max(col_widths[i], len(str(cell)))
        
        # Create format string
        row_format = "|" + "|".join(" {{:<{}}} ".format(width) for width in col_widths) + "|"
        separator = "+" + "+".join("-" * (width + 2) for width in col_widths) + "+"
        
        # Build table
        result = []
        result.append(separator)
        result.append(row_format.format(*headers))
        result.append(separator)
        
        for row in data:
            formatted_row = [str(cell) if cell is not None else "" for cell in row]
            while len(formatted_row) < len(headers):
                formatted_row.append("")
            result.append(row_format.format(*formatted_row[:len(headers)]))
        
        result.append(separator)
        return "\n".join(result)

    def synchronize_databases(self, dry_run=False):
        """Main synchronization logic using docker exec for containers"""
        config = self.load_config()
        self.config = config

        # Get Docker containers
        containers = self.get_docker_containers()
        if not containers:
            logger.warning("No matching Docker containers found")
            return True

        logger.info(f"Found {len(containers)} containers to synchronize")
        
        # Initialize summary tracking for dry run
        if dry_run:
            structure_summary = {}
            data_summary = {}
            lookup_summary = {}
            container_names = [name for _, name, _ in containers]
        
        # Get master structure
        master_structure = self.get_database_structure(
            host=config['DB_HOST'], port=config['MASTER_PORT'], 
            dbname=config['DB_NAME'], user=config['DB_USER'], password=config['DB_PASSWORD']
        )
        
        # Phase 1: Structure synchronization
        logger.info("\n=== Phase 1: Structure Synchronization ===")
        
        for container_id, container_name, is_test in containers:
            logger.info(f"\nProcessing container: {container_name} ({'TEST' if is_test else 'PRODUCTION'})")
            
            # Test connection
            test_sql = "SELECT 1;"
            result = self.execute_sql_in_container(container_id, test_sql, config['DB_NAME'], config['DB_USER'], config['DB_PASSWORD'])
            
            if not result:
                logger.error(f"❌ Failed to connect to {container_name}")
                continue
            
            logger.info(f"✅ Connected to {container_name}")
            
            # Compare structures
            copy_structure = self.get_database_structure(
                container_id=container_id, 
                dbname=config['DB_NAME'], user=config['DB_USER'], password=config['DB_PASSWORD']
            )
            differences = self.compare_structures(master_structure, copy_structure)
            
            # Track structure changes for dry run summary
            if dry_run:
                for table in set(list(differences['missing_tables']) + 
                                list(differences['missing_columns'].keys()) + 
                                list(differences['missing_indexes'].keys()) + 
                                list(differences['extra_indexes'].keys())):
                    if table not in structure_summary:
                        structure_summary[table] = {'master': 'n/a'}
                    
                    changes = []
                    if table in differences['missing_tables']:
                        changes.append('table missing')
                    if table in differences['missing_columns']:
                        changes.append(f"{len(differences['missing_columns'][table])} columns added")
                    if table in differences['missing_indexes']:
                        changes.append(f"{len(differences['missing_indexes'][table])} indexes added")
                    if table in differences['extra_indexes']:
                        changes.append(f"{len(differences['extra_indexes'][table])} indexes removed")
                    
                    structure_summary[table][container_name] = ', '.join(changes) if changes else 'no changes'
            
            # Generate and execute structure fixes
            structure_sql = self.generate_structure_sql(differences, master_structure)
            if structure_sql:
                if not dry_run:
                    logger.info(f"Applying {len(structure_sql)} structural changes to {container_name}")
                if not self.execute_sql_transaction_in_container(container_id, structure_sql, "structural", 
                                                               config['DB_NAME'], config['DB_USER'], config['DB_PASSWORD'], dry_run):
                    logger.error(f"Failed to apply structural changes to {container_name}")
                    return False
            else:
                logger.info(f"No structural changes needed for {container_name}")

        # Phase 2: Data collection and master updates
        logger.info("\n=== Phase 2: Data Collection and Master Updates ===")
        
        for table in self.contributing_tables:
            logger.info(f"\nProcessing data for table: {table}")
            all_new_rows = []
            
            # Track data changes for dry run summary
            if dry_run:
                if table not in data_summary:
                    data_summary[table] = {'master': '0 rows added'}
            
            # Collect new data from all non-test containers
            for container_id, container_name, is_test in containers:
                if is_test:
                    logger.info(f"Skipping data collection from test container: {container_name}")
                    if dry_run:
                        data_summary[table][container_name] = 'skipped (test)'
                    continue
                
                master_data = self.get_table_data(
                    host=config['DB_HOST'], port=config['MASTER_PORT'], 
                    dbname=config['DB_NAME'], user=config['DB_USER'], 
                    password=config['DB_PASSWORD'], table=table
                )
                copy_data = self.get_table_data(
                    container_id=container_id, 
                    dbname=config['DB_NAME'], user=config['DB_USER'], 
                    password=config['DB_PASSWORD'], table=table
                )
                
                new_rows = self.find_new_rows(master_data, copy_data, table)
                if new_rows:
                    logger.info(f"Found {len(new_rows)} new rows in {container_name}.{table}")
                    all_new_rows.extend(new_rows)
                    
                # Track for dry run summary
                if dry_run:
                    data_summary[table][container_name] = f"{len(new_rows)} rows retrieved"

            # Add new rows to master
            if all_new_rows:
                master_data = self.get_table_data(
                    host=config['DB_HOST'], port=config['MASTER_PORT'], 
                    dbname=config['DB_NAME'], user=config['DB_USER'], 
                    password=config['DB_PASSWORD'], table=table
                )
                insert_sql = self.generate_insert_sql(table, master_data[0], all_new_rows)
                
                if dry_run:
                    data_summary[table]['master'] = f"{len(all_new_rows)} rows added"
                else:
                    logger.info(f"Adding {len(all_new_rows)} new rows to master.{table}")
                
                if not self.execute_sql_transaction_on_host(insert_sql, f"data for {table}", 
                                                          config['DB_HOST'], config['MASTER_PORT'],
                                                          config['DB_NAME'], config['DB_USER'], 
                                                          config['DB_PASSWORD'], dry_run):
                    logger.error(f"Failed to add new rows to master.{table}")
                    return False
            elif dry_run:
                # No new rows found across all containers
                for container_id, container_name, is_test in containers:
                    if not is_test and container_name not in data_summary.get(table, {}):
                        if table not in data_summary:
                            data_summary[table] = {}
                        data_summary[table][container_name] = '0 rows retrieved'

        # Phase 3: Sync all lookup data to all containers
        logger.info("\n=== Phase 3: Lookup Data Synchronization ===")
        
        for container_id, container_name, is_test in containers:
            logger.info(f"\nSyncing lookup data to {container_name}")
            
            all_sync_sql = []
            
            # Track lookup changes for dry run
            if dry_run:
                for table in self.lookup_tables:
                    if table not in lookup_summary:
                        lookup_summary[table] = {'master': 'n/a'}
            
            for table in self.lookup_tables:
                master_data = self.get_table_data(
                    host=config['DB_HOST'], port=config['MASTER_PORT'], 
                    dbname=config['DB_NAME'], user=config['DB_USER'], 
                    password=config['DB_PASSWORD'], table=table
                )
                copy_data = self.get_table_data(
                    container_id=container_id, 
                    dbname=config['DB_NAME'], user=config['DB_USER'], 
                    password=config['DB_PASSWORD'], table=table
                )
                
                sync_sql = self.sync_lookup_data(master_data, copy_data, table)
                if sync_sql:
                    logger.info(f"Found {len(sync_sql)} rows to sync for {table}")
                    all_sync_sql.extend(sync_sql)
                    
                    # Track for dry run
                    if dry_run:
                        lookup_summary[table][container_name] = f"{len(sync_sql)} rows synced"
                elif dry_run:
                    lookup_summary[table][container_name] = "no changes"

            if all_sync_sql:
                if not dry_run:
                    logger.info(f"Syncing {len(all_sync_sql)} total rows to {container_name}")
                if not self.execute_sql_transaction_in_container(container_id, all_sync_sql, "lookup data sync", 
                                                               config['DB_NAME'], config['DB_USER'], config['DB_PASSWORD'], dry_run):
                    logger.error(f"Failed to sync lookup data to {container_name}")
                    return False
            else:
                logger.info(f"No lookup data sync needed for {container_name}")

        # Display summary tables for dry run
        if dry_run:
            logger.info("\n" + "="*80)
            logger.info("DRY RUN SUMMARY")
            logger.info("="*80)
            
            # Structure changes table
            if structure_summary:
                logger.info("\n📋 STRUCTURE CHANGES:")
                headers = ['Table', 'Master'] + container_names
                structure_data = []
                
                for table, changes in structure_summary.items():
                    row = [table, changes.get('master', 'n/a')]
                    for container_name in container_names:
                        row.append(changes.get(container_name, 'no changes'))
                    structure_data.append(row)
                
                print(self.format_summary_table(structure_data, headers))
            else:
                logger.info("\n📋 STRUCTURE CHANGES: No structural changes needed")
            
            # Data changes table
            if data_summary:
                logger.info("\n📊 DATA CHANGES (Contributing Tables):")
                headers = ['Table', 'Master'] + container_names
                data_data = []
                
                for table, changes in data_summary.items():
                    row = [table, changes.get('master', '0 rows added')]
                    for container_name in container_names:
                        row.append(changes.get(container_name, '0 rows retrieved'))
                    data_data.append(row)
                
                print(self.format_summary_table(data_data, headers))
            else:
                logger.info("\n📊 DATA CHANGES: No data changes needed")
                
            # Lookup sync table
            if lookup_summary:
                logger.info("\n🔄 LOOKUP DATA SYNCHRONIZATION:")
                headers = ['Table', 'Master'] + container_names
                lookup_data = []
                
                for table, changes in lookup_summary.items():
                    row = [table, changes.get('master', 'n/a')]
                    for container_name in container_names:
                        row.append(changes.get(container_name, 'no changes'))
                    lookup_data.append(row)
                
                print(self.format_summary_table(lookup_data, headers))
            else:
                logger.info("\n🔄 LOOKUP DATA SYNCHRONIZATION: No lookup sync needed")

        logger.info("\n✅ Database synchronization completed successfully")
        return True

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Database synchronization script")
    parser.add_argument("--dry-run", action="store_true", 
                       help="Show what would be done without executing changes")
    parser.add_argument("--verbose", "-v", action="store_true", 
                       help="Enable verbose logging")
    args = parser.parse_args()
    
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    
    if args.dry_run:
        logger.info("🔍 DRY RUN MODE - No changes will be executed")
    
    sync = DatabaseSync({})
    
    try:
        success = sync.synchronize_databases(dry_run=args.dry_run)
        if success:
            if args.dry_run:
                logger.info("✅ Dry run completed - review proposed changes above")
            else:
                logger.info("✅ Database synchronization completed successfully")
            return 0
        else:
            logger.error("❌ Database synchronization failed")
            return 1
    except Exception as e:
        logger.error(f"Unexpected error during synchronization: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
