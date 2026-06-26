import React, {useState} from 'react';
import {
    Alert,
    Box,
    Button,
    Container,
    FormControl,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    TextField,
    Typography,
} from '@mui/material';
import type {SelectChangeEvent} from '@mui/material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import api from '../../utils/api';
import {isDM} from '../../utils/auth';
import SpellbookViewer, {Spellbook} from '../spellbook/SpellbookViewer';

const CLASS_OPTIONS = [
    {value: 'wizard', label: 'Wizard'},
    {value: 'arcanist', label: 'Arcanist'},
    {value: 'magus', label: 'Magus'},
    {value: 'witch', label: 'Witch'},
];

const FULLNESS_OPTIONS = [
    {value: 'sparse', label: 'Sparse'},
    {value: 'standard', label: 'Standard'},
    {value: 'full', label: 'Full'},
    {value: 'exhaustive', label: 'Exhaustive'},
];

const SCHOOLS = [
    'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
    'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
];

const SpellbookGenerator: React.FC = () => {
    const dmMode = isDM();
    const [casterClass, setCasterClass] = useState<string>('wizard');
    const [casterLevel, setCasterLevel] = useState<string>('9');
    const [school, setSchool] = useState<string>('');
    const [fullness, setFullness] = useState<string>('standard');
    const [book, setBook] = useState<Spellbook | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [generating, setGenerating] = useState<boolean>(false);
    const [committing, setCommitting] = useState<boolean>(false);

    if (!dmMode) {
        return (
            <Container maxWidth="lg">
                <Alert severity="warning" sx={{mt: 3}}>The spellbook generator is available to DMs only.</Alert>
            </Container>
        );
    }

    const specialist = casterClass === 'wizard';

    const handleGenerate = async (): Promise<void> => {
        setGenerating(true);
        try {
            const payload: Record<string, unknown> = {
                casterClass,
                casterLevel: parseInt(casterLevel, 10) || 1,
                fullness,
            };
            if (specialist && school) payload.school = school;
            const response = await api.post('/loot-generator/spellbook', payload);
            const data = (response.data || response) as Spellbook;
            setBook(data);
            setError(null);
            setStatus(null);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to generate spellbook.');
        } finally {
            setGenerating(false);
        }
    };

    const handleCommit = async (): Promise<void> => {
        if (!book) return;
        setCommitting(true);
        try {
            const label = book.classLabel || 'Wizard';
            const item = {
                name: `${label} spellbook (CL ${book.casterLevel})`,
                type: 'spellbook',
                quantity: 1,
                value: book.value ?? 0,
                unidentified: false,
                masterwork: false,
                spellbook: {
                    casterClass: book.casterClass,
                    casterLevel: book.casterLevel,
                    school: book.school,
                    spells: book.spells,
                },
            };
            const response = await api.post('/loot-generator/commit', {items: [item], coins: {}});
            const data = response.data || response;
            setBook(null);
            setError(null);
            setStatus(`Sent the spellbook to pending loot${data?.itemsCreated ? '' : ''}.`);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to send the spellbook to loot.');
        } finally {
            setCommitting(false);
        }
    };

    return (
        <Container maxWidth="lg">
            <Typography variant="h4" gutterBottom sx={{display: 'flex', alignItems: 'center', mt: 1}}>
                <AutoStoriesIcon sx={{mr: 1}}/> Spellbook Generator
            </Typography>

            {error && <Alert severity="error" sx={{mb: 2}} onClose={() => setError(null)}>{error}</Alert>}
            {status && <Alert severity="success" sx={{mb: 2}} onClose={() => setStatus(null)}>{status}</Alert>}

            <Paper sx={{p: 2, mb: 2, borderRadius: 2}} elevation={2}>
                <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2}}>
                    <FormControl size="small" sx={{minWidth: 140}}>
                        <InputLabel id="class-label">Class</InputLabel>
                        <Select labelId="class-label" label="Class" value={casterClass}
                                onChange={(e: SelectChangeEvent) => setCasterClass(e.target.value)}>
                            {CLASS_OPTIONS.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <TextField size="small" type="number" label="Caster level" value={casterLevel}
                               sx={{width: 120}} slotProps={{ input: {inputProps: {min: 1, max: 20}} }}
                               onChange={(e) => setCasterLevel(e.target.value)}/>
                    <FormControl size="small" sx={{minWidth: 170}} disabled={!specialist}>
                        <InputLabel id="school-label">Specialty (optional)</InputLabel>
                        <Select labelId="school-label" label="Specialty (optional)" value={specialist ? school : ''}
                                onChange={(e: SelectChangeEvent) => setSchool(e.target.value)}>
                            <MenuItem value=""><em>None</em></MenuItem>
                            {SCHOOLS.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{minWidth: 150}}>
                        <InputLabel id="fullness-label">Fullness</InputLabel>
                        <Select labelId="fullness-label" label="Fullness" value={fullness}
                                onChange={(e: SelectChangeEvent) => setFullness(e.target.value)}>
                            {FULLNESS_OPTIONS.map(f => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <Box sx={{flexGrow: 1}}/>
                    <Button variant="contained" startIcon={<AutoStoriesIcon/>} onClick={handleGenerate}
                            disabled={generating} sx={{textTransform: 'none'}}>
                        {generating ? 'Generating…' : 'Generate Spellbook'}
                    </Button>
                </Box>
            </Paper>

            {book && (
                <Paper sx={{p: 2, mb: 2, borderRadius: 2}} elevation={3}>
                    <Box sx={{display: 'flex', justifyContent: 'flex-end', mb: 1}}>
                        <Button variant="contained" color="success" onClick={handleCommit} disabled={committing}
                                sx={{textTransform: 'none'}}>
                            {committing ? 'Sending…' : 'Send to Pending Loot'}
                        </Button>
                    </Box>
                    <SpellbookViewer book={book}/>
                </Paper>
            )}
        </Container>
    );
};

export default SpellbookGenerator;
