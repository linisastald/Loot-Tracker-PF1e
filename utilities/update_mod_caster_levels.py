#!/usr/bin/env python3
"""
Fill in mod.casterlevel for global Power-type mods (weapon/armor special abilities)
by reading the caster level from d20pfsrd.com.

SAFETY
  * Default is a DRY RUN: scrapes and prints what would change, writes nothing.
  * --apply writes, in ONE transaction, after you type the database name to confirm.
  * Only global catalog rows are touched (campaign_id IS NULL), and only rows whose
    casterlevel is still NULL. Scraped values outside 1-30 are rejected.
  * Credentials come only from environment variables (DB_PASSWORD is required;
    DB_HOST, DB_PORT, DB_NAME, DB_USER are optional). The target database is
    always the one you name; nothing is discovered automatically.
  * Requires the mod.casterlevel column; the script aborts if it is missing.

Usage:
    DB_PASSWORD=... python utilities/update_mod_caster_levels.py            # dry run
    DB_PASSWORD=... python utilities/update_mod_caster_levels.py --apply    # write
"""

import argparse
import logging
import os
import re
import sys
import time
from urllib.parse import urljoin

import psycopg2
import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

USER_AGENT = 'LootTrackerMaintenance/1.0 (one-off caster level lookup; contact: repo owner)'
REQUEST_TIMEOUT = 10
REQUEST_DELAY_SECONDS = 1
MIN_CL, MAX_CL = 1, 30

BASE_URLS = {
    'weapon': 'https://www.d20pfsrd.com/magic-items/magic-weapons/magic-weapon-special-abilities/',
    'armor': 'https://www.d20pfsrd.com/magic-items/magic-armor/magic-armor-and-shield-special-abilities/',
}


def db_config():
    """Connection settings from the environment only. Never hardcode credentials."""
    password = os.environ.get('DB_PASSWORD')
    if not password:
        logger.error('DB_PASSWORD environment variable is required')
        sys.exit(2)
    return {
        'host': os.environ.get('DB_HOST', 'localhost'),
        'port': int(os.environ.get('DB_PORT', '5432')),
        'dbname': os.environ.get('DB_NAME', 'loot_tracking'),
        'user': os.environ.get('DB_USER', 'loot_user'),
        'password': password,
    }


def normalize_name_for_url(name):
    """Convert a mod name to the d20pfsrd URL slug."""
    normalized = re.sub(r'[^\w\s-]', '', name.lower())
    normalized = re.sub(r'\s+', '-', normalized)
    normalized = re.sub(r'-+', '-', normalized)
    return normalized.strip('-')


def scrape_caster_level(session, mod_name, target):
    """Return the caster level found on the mod's page, or None."""
    if target not in BASE_URLS:
        logger.warning('Unknown target type for %s: %s', mod_name, target)
        return None

    url = urljoin(BASE_URLS[target], normalize_name_for_url(mod_name) + '/')
    logger.info('Looking up %s (%s): %s', mod_name, target, url)
    time.sleep(REQUEST_DELAY_SECONDS)

    try:
        response = session.get(url, timeout=REQUEST_TIMEOUT)
        if response.status_code == 404:
            logger.warning('Page not found for %s', mod_name)
            return None
        response.raise_for_status()
    except requests.exceptions.RequestException as exc:
        logger.error('Request error for %s: %s', mod_name, exc)
        return None

    text = BeautifulSoup(response.content, 'html.parser').get_text()
    # "CL 9th" style first, then "Caster Level: 9". Only the first match is used.
    match = (re.search(r'\bCL\s+(\d+)(?:st|nd|rd|th)?\b', text, re.IGNORECASE)
             or re.search(r'Caster\s+Level:?\s+(\d+)', text, re.IGNORECASE))
    if not match:
        logger.warning('No caster level found for %s', mod_name)
        return None

    caster_level = int(match.group(1))
    if not MIN_CL <= caster_level <= MAX_CL:
        logger.warning('Rejecting out-of-range CL %s for %s', caster_level, mod_name)
        return None
    return caster_level


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--apply', action='store_true',
                        help='write the changes (default is a dry run that writes nothing)')
    args = parser.parse_args()

    config = db_config()
    conn = psycopg2.connect(**config)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'mod' AND column_name = 'casterlevel'
            """)
            if cur.fetchone() is None:
                logger.error('mod.casterlevel does not exist in %s; nothing to do', config['dbname'])
                return 1

            # Plain enhancement bonuses (+1..+5) follow a rule: CL = 3 x bonus.
            cur.execute("""
                SELECT count(*) FROM mod
                WHERE name ~ '^\\+[1-5]$' AND type = 'Power'
                  AND casterlevel IS NULL AND campaign_id IS NULL
            """)
            enhancement_rows = cur.fetchone()[0]

            cur.execute("""
                SELECT DISTINCT name, target FROM mod
                WHERE type = 'Power' AND casterlevel IS NULL AND campaign_id IS NULL
                  AND name NOT LIKE '+%'
                ORDER BY name
            """)
            pending = cur.fetchall()

        logger.info('%d enhancement-bonus rows and %d named mods need a caster level',
                    enhancement_rows, len(pending))

        session = requests.Session()
        session.headers['User-Agent'] = USER_AGENT
        found = []
        for mod_name, target in pending:
            caster_level = scrape_caster_level(session, mod_name, target)
            if caster_level is not None:
                found.append((mod_name, target, caster_level))
                logger.info('  %s (%s) -> CL %d', mod_name, target, caster_level)

        logger.info('%d of %d mods resolved', len(found), len(pending))
        if not args.apply:
            logger.info('Dry run: nothing written. Re-run with --apply to write.')
            return 0
        if enhancement_rows == 0 and not found:
            logger.info('Nothing to write.')
            return 0

        answer = input("Type the database name '%s' to write these changes: " % config['dbname'])
        if answer.strip() != config['dbname']:
            logger.info('Confirmation did not match; nothing written.')
            return 1

        with conn.cursor() as cur:
            cur.execute("""
                UPDATE mod SET casterlevel = plus * 3
                WHERE name ~ '^\\+[1-5]$' AND type = 'Power'
                  AND casterlevel IS NULL AND campaign_id IS NULL
            """)
            logger.info('Updated %d enhancement bonus rows', cur.rowcount)
            for mod_name, target, caster_level in found:
                cur.execute("""
                    UPDATE mod SET casterlevel = %s
                    WHERE name = %s AND target = %s AND type = 'Power'
                      AND casterlevel IS NULL AND campaign_id IS NULL
                """, (caster_level, mod_name, target))
                logger.info('Updated %d rows for %s (%s)', cur.rowcount, mod_name, target)
        conn.commit()
        logger.info('Committed.')
        return 0
    except KeyboardInterrupt:
        logger.info('Interrupted; nothing committed.')
        return 1
    finally:
        conn.rollback()
        conn.close()


if __name__ == '__main__':
    sys.exit(main())
