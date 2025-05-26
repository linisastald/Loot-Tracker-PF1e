#!/usr/bin/env python3
"""
Script to scrape d20pfsrd.com for magic weapon/armor special ability caster levels
and update the mod table in the database.
"""

import requests
import re
import time
import psycopg2
from bs4 import BeautifulSoup
from urllib.parse import urljoin, quote
import logging

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'database': 'loot_tracking',
    'user': 'loot_user',
    'password': 'g5Zr7!cXw@2sP9Lk'
}

# Base URLs for different mod types
BASE_URLS = {
    'weapon': 'https://www.d20pfsrd.com/magic-items/magic-weapons/magic-weapon-special-abilities/',
    'armor': 'https://www.d20pfsrd.com/magic-items/magic-armor/magic-armor-and-shield-special-abilities/'
}

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def get_mod_names_from_db():
    """Get all Power-type mod names that need caster level data."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Update enhancement bonuses first
        cursor.execute("""
            UPDATE mod 
            SET casterlevel = plus * 3 
            WHERE name ~ '^\\+[1-5]$' 
            AND type = 'Power' 
            AND casterlevel IS NULL
        """)
        
        enhancement_updated = cursor.rowcount
        if enhancement_updated > 0:
            logger.info(f"Updated {enhancement_updated} enhancement bonus mods")
        
        # Get unique mod names for Power type mods that don't have caster level
        cursor.execute("""
            SELECT DISTINCT name, target 
            FROM mod 
            WHERE type = 'Power' 
            AND casterlevel IS NULL 
            AND name NOT LIKE '+%'
            ORDER BY name
        """)
        
        results = cursor.fetchall()
        conn.commit()
        conn.close()
        
        return results
    except Exception as e:
        logger.error(f"Database error getting mod names: {e}")
        return []

def normalize_name_for_url(name):
    """Convert mod name to URL-friendly format."""
    # Remove special characters and convert to lowercase
    normalized = re.sub(r'[^\w\s-]', '', name.lower())
    # Replace spaces with hyphens
    normalized = re.sub(r'\s+', '-', normalized)
    # Remove multiple hyphens
    normalized = re.sub(r'-+', '-', normalized)
    return normalized.strip('-')

def scrape_caster_level(mod_name, target):
    """Scrape caster level for a specific mod from d20pfsrd."""
    if target not in BASE_URLS:
        logger.warning(f"Unknown target type: {target}")
        return None
    
    # Normalize the mod name for URL
    url_name = normalize_name_for_url(mod_name)
    url = urljoin(BASE_URLS[target], url_name + '/')
    
    try:
        logger.info(f"Scraping {mod_name} ({target}): {url}")
        
        # Add delay to be respectful to the server
        time.sleep(1)
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 404:
            logger.warning(f"Page not found for {mod_name}")
            return None
        
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Look for caster level patterns
        text = soup.get_text()
        
        # Pattern to match "CL 9th", "CL 10th", etc.
        cl_pattern = r'\bCL\s+(\d+)(?:st|nd|rd|th)?\b'
        matches = re.findall(cl_pattern, text, re.IGNORECASE)
        
        if matches:
            # Take the first match (usually the main caster level)
            caster_level = int(matches[0])
            logger.info(f"Found CL {caster_level} for {mod_name}")
            return caster_level
        
        # Alternative pattern: "Caster Level: 9"
        alt_pattern = r'Caster\s+Level:?\s+(\d+)'
        alt_matches = re.findall(alt_pattern, text, re.IGNORECASE)
        
        if alt_matches:
            caster_level = int(alt_matches[0])
            logger.info(f"Found Caster Level {caster_level} for {mod_name}")
            return caster_level
        
        logger.warning(f"No caster level found for {mod_name}")
        return None
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error for {mod_name}: {e}")
        return None
    except Exception as e:
        logger.error(f"Error scraping {mod_name}: {e}")
        return None

def update_mod_caster_level(mod_name, target, caster_level):
    """Update the caster level for a mod in the database."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE mod 
            SET casterlevel = %s 
            WHERE name = %s AND target = %s AND type = 'Power'
        """, (caster_level, mod_name, target))
        
        rows_affected = cursor.rowcount
        conn.commit()
        conn.close()
        
        logger.info(f"Updated {rows_affected} rows for {mod_name} ({target}) with CL {caster_level}")
        return rows_affected > 0
        
    except Exception as e:
        logger.error(f"Database error updating {mod_name}: {e}")
        return False

def main():
    """Main execution function."""
    logger.info("Starting caster level scraping process")
    
    # Get mod names that need caster level data
    logger.info("Getting mod names from database...")
    mod_names = get_mod_names_from_db()
    
    if not mod_names:
        logger.info("No mods found that need caster level data")
        return
    
    logger.info(f"Found {len(mod_names)} mods to process")
    
    success_count = 0
    failure_count = 0
    
    for mod_name, target in mod_names:
        try:
            caster_level = scrape_caster_level(mod_name, target)
            
            if caster_level is not None:
                if update_mod_caster_level(mod_name, target, caster_level):
                    success_count += 1
                else:
                    failure_count += 1
            else:
                failure_count += 1
                
        except KeyboardInterrupt:
            logger.info("Process interrupted by user")
            break
        except Exception as e:
            logger.error(f"Unexpected error processing {mod_name}: {e}")
            failure_count += 1
    
    logger.info(f"Process completed:")
    logger.info(f"  Special abilities successful: {success_count}")
    logger.info(f"  Special abilities failed: {failure_count}")
    logger.info(f"  Total processed: {success_count + failure_count}")

if __name__ == "__main__":
    main()
