import React, {useEffect, useState} from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    Container,
    Divider,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import type {SelectChangeEvent} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CasinoIcon from '@mui/icons-material/Casino';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import api from '../../utils/api';
import {isDM} from '../../utils/auth';

const CREATURE_TYPES = [
    'aberration', 'animal', 'construct', 'dragon', 'fey', 'humanoid', 'magical beast',
    'monstrous humanoid', 'ooze', 'outsider', 'plant', 'undead', 'vermin',
];

const TREASURE_TYPES = [
    {value: 'none', label: 'None'},
    {value: 'incidental', label: 'Incidental (½)'},
    {value: 'standard', label: 'Standard'},
    {value: 'double', label: 'Double'},
    {value: 'triple', label: 'Triple'},
    {value: 'npc_gear', label: 'NPC Gear'},
];

const TRACK_OPTIONS = [
    {value: 'slow', label: 'Slow'},
    {value: 'medium', label: 'Medium'},
    {value: 'fast', label: 'Fast'},
];

const MODIFIER_OPTIONS = [
    {value: '0.5', label: 'Low fantasy (×0.5)'},
    {value: '1', label: 'Standard (×1)'},
    {value: '2', label: 'High fantasy (×2)'},
];

interface EnvOption {
    value: string;
    label: string;
}

// Fallback list if the settings fetch fails; the server is the source of truth.
const DEFAULT_ENVIRONMENTS: EnvOption[] = [
    {value: 'dungeon', label: 'Dungeon / Built Structure'},
    {value: 'urban', label: 'Town / Manor / Castle'},
    {value: 'ruins', label: 'Ancient Ruins / Temple'},
    {value: 'cave', label: 'Cave / Cavern'},
    {value: 'forest', label: 'Forest'},
    {value: 'plains', label: 'Plains / Open Field'},
    {value: 'desert', label: 'Desert'},
    {value: 'arctic', label: 'Arctic / Tundra'},
    {value: 'swamp', label: 'Swamp / Marsh'},
    {value: 'volcano', label: 'Volcano / Lava'},
    {value: 'underwater', label: 'Underwater / Aquatic'},
];

interface EnemyRow {
    localId: number;
    name: string;
    creatureType: string;
    cr: string;
    count: string;
    treasure: string;
    spellcaster: boolean;
}

interface Coins {
    platinum: number;
    gold: number;
    silver: number;
    copper: number;
}

interface PreviewItem {
    name: string;
    unidentifiedName?: string;
    type: string | null;
    size: string | null;
    value: number;
    quantity: number;
    itemId: number | null;
    modIds: number[] | null;
    charges?: number | null;
    unidentified: boolean;
    spellcraftDc: number | null;
    masterwork: boolean;
    category?: string;
    _localId?: number; // stable React key, assigned on receipt
}

interface Preview {
    coins: Coins;
    coinsGp: number;
    items: PreviewItem[];
    totalGp: number;
    effectiveCr?: string | null;
    track: string;
    modifier: number;
    environment?: string;
}

let nextEnemyId = 1;
const makeEnemy = (): EnemyRow => ({
    localId: nextEnemyId++,
    name: '',
    creatureType: 'humanoid',
    cr: '',
    count: '1',
    treasure: 'standard',
    spellcaster: false,
});

const LootGenerator: React.FC = () => {
    const dmMode = isDM();
    const [enemies, setEnemies] = useState<EnemyRow[]>([makeEnemy()]);
    const [track, setTrack] = useState<string>('medium');
    const [modifier, setModifier] = useState<string>('1');
    const [environment, setEnvironment] = useState<string>('dungeon');
    const [environments, setEnvironments] = useState<EnvOption[]>(DEFAULT_ENVIRONMENTS);
    const [unidentified, setUnidentified] = useState<boolean>(true);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [generating, setGenerating] = useState<boolean>(false);
    const [committing, setCommitting] = useState<boolean>(false);

    useEffect(() => {
        if (!dmMode) return;
        (async () => {
            try {
                const response = await api.get('/loot-generator/settings');
                const data = response.data || response;
                if (data?.track) setTrack(data.track);
                if (data?.modifier !== undefined) setModifier(String(data.modifier));
                if (Array.isArray(data?.environments) && data.environments.length > 0) setEnvironments(data.environments);
            } catch {
                // keep defaults
            }
        })();
    }, [dmMode]);

    if (!dmMode) {
        return (
            <Container maxWidth="lg">
                <Alert severity="warning" sx={{mt: 3}}>The loot generator is available to DMs only.</Alert>
            </Container>
        );
    }

    const saveSettings = async (): Promise<void> => {
        try {
            await api.post('/loot-generator/settings', {track, modifier: parseFloat(modifier)});
            setError(null);
            setStatus('Treasure settings saved.');
        } catch {
            setError('Failed to save settings.');
        }
    };

    const addEnemy = (): void => setEnemies(prev => [...prev, makeEnemy()]);
    const removeEnemy = (localId: number): void =>
        setEnemies(prev => (prev.length > 1 ? prev.filter(e => e.localId !== localId) : prev));
    const updateEnemy = (localId: number, field: keyof EnemyRow, value: string | boolean): void =>
        setEnemies(prev => prev.map(e => (e.localId === localId ? {...e, [field]: value} : e)));

    const handleGenerate = async (): Promise<void> => {
        const payload = {
            enemies: enemies.map(e => ({
                name: e.name,
                creatureType: e.creatureType,
                cr: e.cr.trim(),
                count: parseInt(e.count, 10) || 1,
                treasure: e.treasure,
                spellcaster: e.spellcaster,
            })),
            track,
            modifier: parseFloat(modifier),
            unidentified,
            environment,
        };
        setGenerating(true);
        try {
            const response = await api.post('/loot-generator/generate', payload);
            const data = (response.data || response) as Preview;
            // Assign stable local ids so editing/removing an item doesn't shuffle
            // React keys (which would jump input focus between rows).
            let itemId = 0;
            data.items = (data.items || []).map(it => ({...it, _localId: itemId++}));
            setPreview(data);
            setError(null);
            setStatus(null);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to generate treasure.');
        } finally {
            setGenerating(false);
        }
    };

    const handleItemChange = (index: number, field: 'value' | 'quantity', raw: string): void => {
        setPreview(prev => {
            if (!prev) return prev;
            const parsed = field === 'quantity' ? parseInt(raw, 10) : parseFloat(raw);
            const floor = field === 'quantity' ? 1 : 0;
            const items = prev.items.map((it, i) =>
                i === index ? {...it, [field]: Math.max(floor, Number.isFinite(parsed) ? parsed : 0)} : it);
            return {...prev, items};
        });
    };

    const handleRemoveItem = (index: number): void => {
        setPreview(prev => (prev ? {...prev, items: prev.items.filter((_, i) => i !== index)} : prev));
    };

    const handleCoinChange = (field: keyof Coins, raw: string): void => {
        setPreview(prev => (prev ? {...prev, coins: {...prev.coins, [field]: Math.max(0, parseInt(raw, 10) || 0)}} : prev));
    };

    const handleCommit = async (): Promise<void> => {
        if (!preview) return;
        setCommitting(true);
        try {
            const response = await api.post('/loot-generator/commit', {
                items: preview.items,
                coins: preview.coins,
            });
            const data = response.data || response;
            setPreview(null);
            setError(null);
            setStatus(`Committed ${data?.itemsCreated ?? 0} item stack(s) to pending loot${data?.coinsPosted ? ' and posted coins to the gold ledger' : ''}.`);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to commit treasure.');
        } finally {
            setCommitting(false);
        }
    };

    const previewItemsValue = preview
        ? preview.items.reduce((s, it) => s + it.value * it.quantity, 0)
        : 0;

    return (
        <Container maxWidth="lg">
            <Typography variant="h4" gutterBottom sx={{display: 'flex', alignItems: 'center', mt: 1}}>
                <CasinoIcon sx={{mr: 1}}/> Loot Generator
            </Typography>
            {error && <Alert severity="error" sx={{mb: 2}} onClose={() => setError(null)}>{error}</Alert>}
            {status && <Alert severity="success" sx={{mb: 2}} onClose={() => setStatus(null)}>{status}</Alert>}
            {/* Treasure settings */}
            <Paper sx={{p: 2, mb: 2, borderRadius: 2}} elevation={2}>
                <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2}}>
                    <FormControl size="small" sx={{minWidth: 140}}>
                        <InputLabel id="track-label">Track</InputLabel>
                        <Select labelId="track-label" label="Track" value={track}
                                onChange={(e: SelectChangeEvent) => setTrack(e.target.value)}>
                            {TRACK_OPTIONS.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{minWidth: 180}}>
                        <InputLabel id="modifier-label">Fantasy level</InputLabel>
                        <Select labelId="modifier-label" label="Fantasy level" value={modifier}
                                onChange={(e: SelectChangeEvent) => setModifier(e.target.value)}>
                            {MODIFIER_OPTIONS.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <Button variant="outlined" onClick={saveSettings} sx={{textTransform: 'none'}}>
                        Save as campaign default
                    </Button>
                    <FormControlLabel
                        control={<Checkbox checked={unidentified} onChange={(e) => setUnidentified(e.target.checked)}/>}
                        label="Magic items unidentified"
                    />
                </Box>
            </Paper>
            {/* Enemy list */}
            <Paper sx={{p: 2, mb: 2, borderRadius: 2}} elevation={2}>
                <Typography variant="h6" gutterBottom>Encounter</Typography>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{minWidth: 120}}>Name (optional)</TableCell>
                                <TableCell sx={{minWidth: 150}}>Type</TableCell>
                                <TableCell sx={{width: 90}}>CR</TableCell>
                                <TableCell sx={{width: 80}}>Count</TableCell>
                                <TableCell sx={{minWidth: 140}}>Treasure</TableCell>
                                <TableCell align="center">Caster</TableCell>
                                <TableCell/>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {enemies.map(e => (
                                <TableRow key={e.localId}>
                                    <TableCell>
                                        <TextField size="small" fullWidth value={e.name}
                                                   onChange={(ev) => updateEnemy(e.localId, 'name', ev.target.value)}/>
                                    </TableCell>
                                    <TableCell>
                                        <Select size="small" fullWidth value={e.creatureType} aria-label="creature type"
                                                onChange={(ev: SelectChangeEvent) => updateEnemy(e.localId, 'creatureType', ev.target.value)}>
                                            {CREATURE_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        <TextField size="small" fullWidth value={e.cr} placeholder="8 or 1/2"
                                                   onChange={(ev) => updateEnemy(e.localId, 'cr', ev.target.value)}/>
                                    </TableCell>
                                    <TableCell>
                                        <TextField size="small" type="number" fullWidth value={e.count}
                                                   slotProps={{ input: {inputProps: {min: 1}} }}
                                                   onChange={(ev) => updateEnemy(e.localId, 'count', ev.target.value)}/>
                                    </TableCell>
                                    <TableCell>
                                        <Select size="small" fullWidth value={e.treasure} aria-label="treasure type"
                                                onChange={(ev: SelectChangeEvent) => updateEnemy(e.localId, 'treasure', ev.target.value)}>
                                            {TREASURE_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                                        </Select>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Checkbox size="small" checked={e.spellcaster}
                                                  onChange={(ev) => updateEnemy(e.localId, 'spellcaster', ev.target.checked)}/>
                                    </TableCell>
                                    <TableCell>
                                        <IconButton size="small" aria-label="remove enemy"
                                                    onClick={() => removeEnemy(e.localId)} disabled={enemies.length <= 1}>
                                            <DeleteIcon fontSize="small"/>
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                <Box sx={{mt: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap'}}>
                    <Button startIcon={<AddIcon/>} onClick={addEnemy} sx={{textTransform: 'none'}}>Add enemy</Button>
                    <Box sx={{flexGrow: 1}}/>
                    <FormControl size="small" sx={{minWidth: 200}}>
                        <InputLabel id="environment-label">Location</InputLabel>
                        <Select labelId="environment-label" label="Location" value={environment}
                                onChange={(e: SelectChangeEvent) => setEnvironment(e.target.value)}>
                            {environments.map(en => <MenuItem key={en.value} value={en.value}>{en.label}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <Button variant="contained" startIcon={<CasinoIcon/>} onClick={handleGenerate}
                            disabled={generating} sx={{textTransform: 'none'}}>
                        {generating ? 'Generating…' : 'Generate Treasure'}
                    </Button>
                </Box>
            </Paper>
            {/* Preview */}
            {preview && (
                <Paper sx={{p: 2, mb: 2, borderRadius: 2}} elevation={3}>
                    <Box sx={{display: 'flex', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1}}>
                        <Typography variant="h6">Preview</Typography>
                        <Chip label={`Total ≈ ${preview.totalGp.toLocaleString()} gp`} color="primary" variant="outlined"/>
                        {preview.effectiveCr && (
                            <Chip label={`Encounter CR ${preview.effectiveCr}`} size="small" variant="outlined"/>
                        )}
                        <Chip label={`${preview.track}, ×${preview.modifier}`} size="small" variant="outlined"/>
                        {preview.environment && (
                            <Chip
                                label={environments.find(en => en.value === preview.environment)?.label || preview.environment}
                                size="small" variant="outlined"/>
                        )}
                        <Box sx={{flexGrow: 1}}/>
                        <Button startIcon={<AutorenewIcon/>} onClick={handleGenerate} disabled={generating}
                                sx={{textTransform: 'none'}}>Regenerate</Button>
                        <Button variant="contained" color="success" onClick={handleCommit} disabled={committing}
                                sx={{textTransform: 'none'}}>
                            {committing ? 'Committing…' : 'Send to Pending Loot'}
                        </Button>
                    </Box>

                    <Typography variant="subtitle2" sx={{mb: 1}}>Coins (post to gold ledger)</Typography>
                    <Grid container spacing={1} sx={{mb: 2}}>
                        {(['platinum', 'gold', 'silver', 'copper'] as (keyof Coins)[]).map(denom => (
                            <Grid size={{xs: 6, sm: 3}} key={denom}>
                                <TextField size="small" type="number" fullWidth label={denom}
                                           value={preview.coins[denom]}
                                           slotProps={{ input: {inputProps: {min: 0}} }}
                                           onChange={(e) => handleCoinChange(denom, e.target.value)}/>
                            </Grid>
                        ))}
                    </Grid>

                    <Typography variant="subtitle2" sx={{mb: 1}}>
                        Items → pending loot ({previewItemsValue.toLocaleString()} gp)
                    </Typography>
                    {preview.items.length === 0 ? (
                        <Typography variant="body2" sx={{
                            color: "text.secondary"
                        }}>No items generated.</Typography>
                    ) : (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Item</TableCell>
                                        <TableCell sx={{width: 90}}>Type</TableCell>
                                        <TableCell sx={{width: 110}}>Value (gp)</TableCell>
                                        <TableCell sx={{width: 80}}>Qty</TableCell>
                                        <TableCell align="center" sx={{width: 90}}>Unident.</TableCell>
                                        <TableCell sx={{width: 60}}>DC</TableCell>
                                        <TableCell/>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {preview.items.map((it, i) => (
                                        <TableRow key={it._localId ?? `${it.name}-${i}`}>
                                            <TableCell title={it.unidentified ? `Stored in loot as: ${it.unidentifiedName || 'Unidentified item'}` : undefined}>
                                                {it.name}
                                                {it.charges ? ` (${it.charges} charges)` : ''}
                                                {it.unidentified && (
                                                    <Typography
                                                        component="span"
                                                        variant="caption"
                                                        sx={{
                                                            color: "text.secondary",
                                                            ml: 0.5
                                                        }}>
                                                        (unident. → {it.unidentifiedName || 'Unidentified item'})
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>{it.type}</TableCell>
                                            <TableCell>
                                                <TextField size="small" type="number" value={it.value}
                                                           slotProps={{ input: {inputProps: {min: 0}} }}
                                                           onChange={(e) => handleItemChange(i, 'value', e.target.value)}/>
                                            </TableCell>
                                            <TableCell>
                                                <TextField size="small" type="number" value={it.quantity}
                                                           slotProps={{ input: {inputProps: {min: 1}} }}
                                                           onChange={(e) => handleItemChange(i, 'quantity', e.target.value)}/>
                                            </TableCell>
                                            <TableCell align="center">
                                                {it.unidentified ? <Chip label="?" size="small" color="warning"/> : null}
                                            </TableCell>
                                            <TableCell>{it.spellcraftDc ?? ''}</TableCell>
                                            <TableCell>
                                                <IconButton size="small" aria-label="remove item"
                                                            onClick={() => handleRemoveItem(i)}>
                                                    <DeleteIcon fontSize="small"/>
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                    <Divider sx={{my: 1}}/>
                    <Typography variant="caption" sx={{
                        color: "text.secondary"
                    }}>
                        Items are added to pending loot (unprocessed); coins post to the gold ledger as a "Loot" transaction.
                    </Typography>
                </Paper>
            )}
        </Container>
    );
};

export default LootGenerator;
