import React from 'react';
import {Box, Chip, Divider, Stack, Typography} from '@mui/material';

export interface SpellbookSpell {
    id?: number | null;
    name: string;
    level: number;
    school?: string | null;
}

export interface Spellbook {
    casterClass?: string;
    classLabel?: string;
    casterLevel: number;
    maxSpellLevel?: number;
    school?: string | null;
    spells: SpellbookSpell[];
    value?: number;
    spellCount?: number;
}

const levelLabel = (lvl: number): string => {
    if (lvl === 0) return 'Cantrips';
    const suffix = lvl === 1 ? 'st' : lvl === 2 ? 'nd' : lvl === 3 ? 'rd' : 'th';
    return `${lvl}${suffix} level`;
};

interface Props {
    book: Spellbook;
}

const SpellbookViewer: React.FC<Props> = ({book}) => {
    const label = book.classLabel || (book.casterClass ? book.casterClass.charAt(0).toUpperCase() + book.casterClass.slice(1) : 'Wizard');
    const maxLevel = book.spells.reduce((m, s) => Math.max(m, s.level), 0);
    const count = book.spellCount ?? book.spells.length;

    return (
        <Box>
            <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1}}>
                <Typography variant="subtitle1" sx={{fontWeight: 600}}>
                    {label} spellbook — CL {book.casterLevel}
                </Typography>
                {book.school && <Chip size="small" label={`Specialist: ${book.school}`} color="primary" variant="outlined"/>}
                <Chip size="small" label={`${count} spells`} variant="outlined"/>
                {book.value !== undefined && <Chip size="small" label={`${book.value.toLocaleString()} gp`} variant="outlined"/>}
            </Box>
            {count === 0 && (
                <Typography variant="body2" sx={{
                    color: "text.secondary"
                }}>No spells.</Typography>
            )}
            {Array.from({length: maxLevel + 1}, (_, lvl) => {
                const spells = book.spells
                    .filter(s => s.level === lvl)
                    .sort((a, b) => a.name.localeCompare(b.name));
                if (spells.length === 0) return null;
                return (
                    <Box key={lvl} sx={{mb: 1.5}}>
                        <Divider textAlign="left" sx={{mb: 0.5}}>
                            <Typography variant="overline" sx={{
                                color: "text.secondary"
                            }}>
                                {levelLabel(lvl)} ({spells.length})
                            </Typography>
                        </Divider>
                        <Stack
                            direction="row"
                            sx={{
                                flexWrap: "wrap",
                                gap: 0.5
                            }}>
                            {spells.map((s, i) => (
                                <Chip
                                    key={`${s.id ?? s.name}-${i}`}
                                    size="small"
                                    label={s.name}
                                    title={s.school || undefined}
                                    sx={{mb: 0.5}}
                                />
                            ))}
                        </Stack>
                    </Box>
                );
            })}
        </Box>
    );
};

export default SpellbookViewer;
