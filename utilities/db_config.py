"""
Database configuration module that reads credentials from environment variables.
This centralizes database connection logic and removes hard-coded passwords.
"""
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

def get_db_config():
    """
    Get database configuration from environment variables.
    Falls back to default values for development if not set.
    """
    return {
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': os.getenv('DB_PORT', '5432'),
        'database': os.getenv('DB_NAME', 'postgres'),
        'user': os.getenv('DB_USER', 'loot_user'),
        'password': os.getenv('DB_PASSWORD', 'your_password_here')
    }

def get_connection_string():
    """
    Get a PostgreSQL connection string for use with psycopg2.
    """
    config = get_db_config()
    return f"host={config['host']} port={config['port']} dbname={config['database']} user={config['user']} password={config['password']}"

def get_sqlalchemy_url():
    """
    Get a SQLAlchemy database URL.
    """
    config = get_db_config()
    return f"postgresql://{config['user']}:{config['password']}@{config['host']}:{config['port']}/{config['database']}"