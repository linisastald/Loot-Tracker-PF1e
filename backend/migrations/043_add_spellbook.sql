-- Migration 043: spellbook generator storage
-- A generated spellbook is attached to a loot item; its spells are stored
-- denormalized (name/level/school) so the viewer needs no join and the list is
-- stable even if the spells reference data later changes. spell_id keeps a link
-- back to the catalog when available.

CREATE TABLE IF NOT EXISTS spellbook (
    id SERIAL PRIMARY KEY,
    loot_id INTEGER NOT NULL REFERENCES loot(id) ON DELETE CASCADE,
    caster_class VARCHAR(20) NOT NULL,
    caster_level INTEGER NOT NULL,
    school VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spellbook_spell (
    id SERIAL PRIMARY KEY,
    spellbook_id INTEGER NOT NULL REFERENCES spellbook(id) ON DELETE CASCADE,
    spell_id INTEGER REFERENCES spells(id),
    spell_name VARCHAR(255) NOT NULL,
    spell_level INTEGER NOT NULL,
    school VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_spellbook_loot ON spellbook(loot_id);
CREATE INDEX IF NOT EXISTS idx_spellbook_spell_book ON spellbook_spell(spellbook_id);

COMMENT ON TABLE spellbook IS 'A generated spellbook attached to a loot item (loot generator)';
COMMENT ON TABLE spellbook_spell IS 'Spells contained in a generated spellbook (denormalized for display)';
