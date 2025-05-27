#!/usr/bin/env python3

import psycopg2
import subprocess
import sys
import re
import logging
import os
import configparser
from contextlib import contextmanager
import time
import json
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger('lookup_resolver')

class LookupConflictResolver:
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

    def load_config(self):
        """Load database configuration"""
        config = {
            'DB_HOST': 'localhost',
            'DB_NAME': 'loot_tracking',
            'DB_USER': 'loot_user',
            'DB_PASSWORD': 'g5Zr7!cXw@2sP9Lk',
            'MASTER_PORT': 5432,
            'CONTAINER_FILTER': 'loot_db'
        }

        config_parser = configparser.ConfigParser()
        if os.path.exists('config.ini'):
            config_parser.read('config.ini')
            if 'Database' in config_parser:
                for key in config:
                    if key in config_parser['Database']:
                        config[key] = config_parser['Database'][key]

        for key in config:
            env_value = os.environ.get(key)
            if env_value:
                config[key] = env_value

        return config

    def get_docker_containers(self):
        """Get Docker containers"""
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
            logger.error(f"Error getting containers: {e}")
            return []

    def get_container_port(self, container_id):
        """Get container port"""
        try:
            result = subprocess.run(['docker', 'port', container_id, '5432'],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    universal_newlines=True, check=True)
            if result.stdout:
                port_match = re.search(r':(\d+)$', result.stdout.strip())
                if port_match:
                    return port_match.group(1)
        except subprocess.CalledProcessError:
            pass
        return None

    @contextmanager
    def db_connection(self, host, port, dbname, user, password, connection_name="DB"):
        """Database connection context manager"""
        conn = None
        try:
            conn = psycopg2.connect(host=host, port=port, dbname=dbname, user=user, password=password)
            logger.debug(f"Connected to {connection_name}")
            yield conn
        except psycopg2.Error as e:
            logger.error(f"Connection error for {connection_name}: {e}")
            yield None
        finally:
            if conn:
                conn.close()

    def build_lookup_key(self, row_dict, table):
        """Build lookup key from row data"""
        key_fields = self.lookup_tables[table]['key_fields']
        key_values = []
        
        for field in key_fields:
            value = row_dict.get(field)
            key_values.append(str(value) if value is not None else 'NULL')
        
        return '|'.join(key_values)

    def get_table_data(self, conn, table):
        """Get table data as dict keyed by lookup key"""
        try:
            with conn.cursor() as cur:
                cur.execute(f'SELECT * FROM "{table}"')
                columns = [desc[0] for desc in cur.description]
                rows = cur.fetchall()
                
                data = {}
                for row in rows:
                    row_dict = dict(zip(columns, row))
                    lookup_key = self.build_lookup_key(row_dict, table)
                    data[lookup_key] = row_dict
                    
                return columns, data
        except psycopg2.Error as e:
            logger.error(f"Error fetching data for {table}: {e}")
            return [], {}

    def find_conflicts(self, all_data):
        """Find conflicting rows across databases"""
        conflicts = {}
        
        # Get all unique keys across all databases
        all_keys = set()
        for db_name, (columns, data) in all_data.items():
            all_keys.update(data.keys())
        
        for key in all_keys:
            versions = {}
            for db_name, (columns, data) in all_data.items():
                if key in data:
                    # Convert row to comparable format
                    row = data[key].copy()
                    
                    # Convert to JSON for comparison
                    row_json = json.dumps(row, sort_keys=True, default=str)
                    if row_json not in versions:
                        versions[row_json] = {'data': row, 'databases': []}
                    versions[row_json]['databases'].append(db_name)
            
            # If more than one version exists, it's a conflict
            if len(versions) > 1:
                conflicts[key] = list(versions.values())
        
        return conflicts

    def display_conflict(self, key, versions, columns):
        """Display conflict options to user"""
        print(f"\n{'='*80}")
        print(f"CONFLICT FOUND FOR: {key}")
        print(f"{'='*80}")
        
        for i, version in enumerate(versions, 1):
            databases = ', '.join(version['databases'])
            print(f"\nOption {i} (Found in: {databases}):")
            
            for col, val in version['data'].items():
                if val is not None:
                    if isinstance(val, list):
                        val = f"ARRAY{val}"
                    elif isinstance(val, dict):
                        val = json.dumps(val)
                print(f"  {col}: {val}")

    def get_user_choice(self, num_versions):
        """Get user's choice for conflict resolution"""
        while True:
            try:
                choice = input(f"\nSelect option (1-{num_versions}) or 's' to skip: ").strip()
                if choice.lower() == 's':
                    return None
                choice = int(choice)
                if 1 <= choice <= num_versions:
                    return choice - 1
                print(f"Please enter a number between 1 and {num_versions}")
            except ValueError:
                print("Invalid input. Please enter a number or 's'")

    def generate_update_sql(self, table, columns, chosen_data):
        """Generate SQL to update all databases with chosen version"""
        key_fields = self.lookup_tables[table]['key_fields']
        
        # Build SET clause
        set_clauses = []
        for col, val in chosen_data.items():
            if col not in key_fields:  # Don't update key fields
                formatted_val = self.format_sql_value(val)
                set_clauses.append(f'"{col}" = {formatted_val}')
        
        if not set_clauses:
            return None
        
        # Build WHERE clause
        where_clauses = []
        for field in key_fields:
            val = chosen_data.get(field)
            formatted_val = self.format_sql_value(val)
            where_clauses.append(f'"{field}" = {formatted_val}')
        
        sql = f'UPDATE "{table}" SET {", ".join(set_clauses)} WHERE {" AND ".join(where_clauses)};'
        return sql

    def format_sql_value(self, val):
        """Format value for SQL"""
        if val is None:
            return "NULL"
        elif isinstance(val, str):
            return f"'{val.replace(chr(39), chr(39)+chr(39))}'"
        elif isinstance(val, bool):
            return str(val).upper()
        elif isinstance(val, list):
            if not val:
                return "ARRAY[]::text[]"
            else:
                elements = []
                for element in val:
                    if isinstance(element, str):
                        elements.append(f"'{element.replace(chr(39), chr(39)+chr(39))}'")
                    else:
                        elements.append(str(element))
                return f"ARRAY[{', '.join(elements)}]"
        elif isinstance(val, dict):
            json_str = json.dumps(val).replace(chr(39), chr(39)+chr(39))
            return f"'{json_str}'"
        elif isinstance(val, (datetime, time.struct_time)):
            if hasattr(val, 'isoformat'):
                return f"'{val.isoformat()}'"
            else:
                return f"'{str(val)}'"
        else:
            return str(val)

    def execute_updates(self, all_connections, update_sql):
        """Execute update SQL on all databases"""
        success_count = 0
        for db_name, conn in all_connections.items():
            if conn:
                try:
                    with conn:
                        with conn.cursor() as cur:
                            cur.execute(update_sql)
                    logger.info(f"Updated {db_name}")
                    success_count += 1
                except psycopg2.Error as e:
                    logger.error(f"Failed to update {db_name}: {e}")
        
        return success_count

    def resolve_conflicts(self):
        """Main conflict resolution process"""
        self.config = self.load_config()
        
        # Get containers
        containers = self.get_docker_containers()
        if not containers:
            logger.warning("No Docker containers found")
            return
        
        logger.info(f"Found {len(containers)} containers")
        
        # Connect to all databases
        all_connections = {}
        
        # Master connection
        with self.db_connection(self.config['DB_HOST'], self.config['MASTER_PORT'], 
                               self.config['DB_NAME'], self.config['DB_USER'], 
                               self.config['DB_PASSWORD'], "Master") as master_conn:
            if not master_conn:
                logger.error("Failed to connect to master database")
                return
            
            all_connections['master'] = master_conn
            
            # Container connections
            for container_id, container_name, is_test in containers:
                container_port = self.get_container_port(container_id)
                if container_port:
                    with self.db_connection(self.config['DB_HOST'], container_port,
                                           self.config['DB_NAME'], self.config['DB_USER'],
                                           self.config['DB_PASSWORD'], container_name) as conn:
                        if conn:
                            all_connections[container_name] = conn
            
            if len(all_connections) < 2:
                logger.error("Need at least 2 database connections")
                return
            
            # Process each lookup table
            total_conflicts = 0
            resolved_conflicts = 0
            
            for table in self.lookup_tables:
                self.current_table = table
                logger.info(f"\nChecking table: {table}")
                
                # Get data from all databases
                all_data = {}
                for db_name, conn in all_connections.items():
                    columns, data = self.get_table_data(conn, table)
                    all_data[db_name] = (columns, data)
                
                # Find conflicts
                conflicts = self.find_conflicts(all_data)
                
                if not conflicts:
                    logger.info(f"No conflicts found in {table}")
                    continue
                
                logger.info(f"Found {len(conflicts)} conflicts in {table}")
                total_conflicts += len(conflicts)
                
                # Get columns for display
                columns = next(iter(all_data.values()))[0]
                
                # Resolve each conflict
                for key, versions in conflicts.items():
                    self.display_conflict(key, versions, columns)
                    
                    choice = self.get_user_choice(len(versions))
                    if choice is None:
                        print("Skipped")
                        continue
                    
                    chosen_data = versions[choice]['data']
                    update_sql = self.generate_update_sql(table, columns, chosen_data)
                    
                    if update_sql:
                        print(f"\nApplying update: {update_sql}")
                        success_count = self.execute_updates(all_connections, update_sql)
                        
                        if success_count == len(all_connections):
                            logger.info("✅ Successfully updated all databases")
                            resolved_conflicts += 1
                        else:
                            logger.warning(f"⚠️ Updated {success_count}/{len(all_connections)} databases")
                    else:
                        logger.info("No updates needed (only key fields differ)")
            
            print(f"\n{'='*80}")
            print(f"SUMMARY: Resolved {resolved_conflicts}/{total_conflicts} conflicts")
            print(f"{'='*80}")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Resolve lookup table conflicts")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")
    args = parser.parse_args()
    
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    
    resolver = LookupConflictResolver()
    resolver.resolve_conflicts()

if __name__ == "__main__":
    main()
