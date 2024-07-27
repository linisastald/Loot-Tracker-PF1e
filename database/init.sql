-- Create database (this will fail if the database already exists, which is fine)
CREATE DATABASE loot_tracking;

-- Connect to the new database
\c loot_tracking

-- Create user and grant privileges
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'loot_user') THEN

      CREATE ROLE loot_user LOGIN PASSWORD 'g5Zr7!cXw@2sP9Lk';
   END IF;
END
$do$;

GRANT ALL PRIVILEGES ON DATABASE loot_tracking TO loot_user;

-- Grant privileges on all tables to the user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO loot_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO loot_user;


-- Create tables

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(7) NOT NULL,
    joined TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE characters (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    appraisal_bonus INTEGER NOT NULL,
    birthday DATE,
    deathday DATE,
    active BOOLEAN DEFAULT true,
    user_id INTEGER REFERENCES users(id)
);

CREATE TABLE item (
    id SERIAL PRIMARY KEY,
    name VARCHAR(127) NOT NULL,
    type VARCHAR(15) NOT NULL,
    value NUMERIC,
    subtype VARCHAR(31)
);

CREATE TABLE mod (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    plus INTEGER,
    type VARCHAR(31),
    valuecalc VARCHAR(255),
    target VARCHAR(31),
    subtarget VARCHAR(31)
);

CREATE TABLE loot (
    id SERIAL PRIMARY KEY,
    session_date DATE NOT NULL,
    quantity INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    unidentified BOOLEAN,
    masterwork BOOLEAN,
    type VARCHAR(15),
    size VARCHAR(15),
    status VARCHAR(15),
    itemid INTEGER REFERENCES item(id),
    modids INTEGER[],
    charges INTEGER,
    value NUMERIC,
    whohas INTEGER REFERENCES characters(id),
    whoupdated INTEGER REFERENCES users(id),
    lastupdate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes VARCHAR(511)
);

CREATE TABLE appraisal (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    characterid INTEGER REFERENCES characters(id),
    lootid INTEGER REFERENCES loot(id),
    appraisalroll INTEGER,
    believedvalue NUMERIC,
    UNIQUE (characterid, lootid)
);

CREATE TABLE gold (
    id SERIAL PRIMARY KEY,
    session_date TIMESTAMP NOT NULL,
    who INTEGER REFERENCES users(id),
    transaction_type VARCHAR(63) NOT NULL,
    notes VARCHAR(255),
    copper INTEGER,
    silver INTEGER,
    gold INTEGER,
    platinum INTEGER
);

CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    value INTEGER NOT NULL
);

CREATE TABLE sold (
    id SERIAL PRIMARY KEY,
    lootid INTEGER REFERENCES loot(id),
    soldfor NUMERIC,
    soldon DATE
);

-- Insert initial data for settings
INSERT INTO settings (name, value) VALUES ('registrations open', 1);
