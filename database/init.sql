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
    value NUMERIC
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
