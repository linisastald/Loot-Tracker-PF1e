import React, { useEffect, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  Typography,
  Button,
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { parseISO, format } from 'date-fns';
import { fetchItemNames } from '../../utils/lootEntryUtils';
import { GOLD_TRANSACTION_TYPES, ITEM_SIZES, ITEM_TYPES } from '../../utils/itemOptions';

/** A catalog item offered by the item-name autocomplete. */
export interface ItemSuggestion {
  id: number;
  name: string;
  type?: string | null;
  subtype?: string | null;
  value?: number | string | null;
}

/** Fields of one entry row; item rows use the first group, gold rows the second. */
export interface EntryData {
  sessionDate?: string | Date | null;
  notes?: string;
  // item
  quantity?: number | string;
  name?: string;
  itemId?: number | null;
  type?: string;
  value?: number | string | null;
  unidentified?: boolean | null;
  masterwork?: boolean | null;
  size?: string;
  parseItem?: boolean;
  charges?: number | string;
  // gold
  transactionType?: string;
  platinum?: number | string;
  gold?: number | string;
  silver?: number | string;
  copper?: number | string;
  characterId?: string;
}

export interface LootEntryItem {
  type: string; // 'item' or 'gold'
  data: EntryData;
  error?: string | null;
}

interface EntryFormProps {
  entry: LootEntryItem;
  index: number;
  onRemove: () => void;
  onChange: (index: number, updates: Partial<EntryData>) => void;
  isDM?: boolean;
  characters?: { id: number; name: string }[];
  /** Whether Smart Item Detection is available (an OpenAI key is configured); fetched once by the page */
  hasOpenAiKey?: boolean;
  /** Initial autocomplete suggestions; fetched once by the page */
  initialItemOptions?: ItemSuggestion[];
}

type CoinField = 'platinum' | 'gold' | 'silver' | 'copper';
const COIN_FIELDS: { field: CoinField; label: string }[] = [
  { field: 'platinum', label: 'Platinum' },
  { field: 'gold', label: 'Gold' },
  { field: 'silver', label: 'Silver' },
  { field: 'copper', label: 'Copper' },
];

// How long typing pauses before the suggestion list is refreshed
const SUGGESTION_DEBOUNCE_MS = 250;

// sessionDate is stored as a 'yyyy-MM-dd' string. Convert to/from a Date for the
// MUI DatePicker without shifting the day across timezones (parse only the date
// part; format in local time). An empty or invalid value stays empty (null) so
// the picker can be cleared; new entries are created with today's date.
const parseStoredDate = (v: EntryData['sessionDate']): Date | null => {
  if (!v) return null;
  const d = typeof v === 'string' ? parseISO(v.split('T')[0]) : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
const formatStoredDate = (date: Date | null): string | null =>
  date && !isNaN(date.getTime()) ? format(date, 'yyyy-MM-dd') : null;

const NO_SUGGESTIONS: ItemSuggestion[] = [];

const EntryForm: React.FC<EntryFormProps> = ({
  entry,
  index,
  onRemove,
  onChange,
  isDM = false,
  characters = [],
  hasOpenAiKey = false,
  initialItemOptions = NO_SUGGESTIONS,
}) => {
  const data = entry.data;
  const [itemSuggestions, setItemSuggestions] = useState<ItemSuggestion[]>(initialItemOptions);
  const [magicDialogShown, setMagicDialogShown] = useState(false);
  const [showMagicMessage, setShowMagicMessage] = useState(false);

  // Latest-request guard + debounce so a slow older response cannot replace newer suggestions
  const suggestionRequest = useRef(0);
  const suggestionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setItemSuggestions(initialItemOptions);
  }, [initialItemOptions]);

  useEffect(() => () => {
    clearTimeout(suggestionTimer.current);
    suggestionRequest.current += 1;
  }, []);

  const loadSuggestions = (query: string) => {
    clearTimeout(suggestionTimer.current);
    const requestId = ++suggestionRequest.current;
    if (query.length < 2) return;
    suggestionTimer.current = setTimeout(async () => {
      const items = await fetchItemNames(query);
      if (requestId === suggestionRequest.current) setItemSuggestions(items);
    }, SUGGESTION_DEBOUNCE_MS);
  };

  // Every field change goes through here: one notification to the parent
  const applyUpdates = (updates: Partial<EntryData>) => onChange(index, updates);

  const handleChange = <K extends keyof EntryData>(field: K, value: EntryData[K]) => {
    // Smart Item Detection needs an OpenAI key
    if (field === 'parseItem' && value === true && !hasOpenAiKey) return;

    const updates: Partial<EntryData> = { [field]: value };

    // An unidentified item has no catalog link and cannot be smart-detected
    if (field === 'unidentified' && value === true) {
      updates.parseItem = false;
      updates.itemId = null;
    }

    // Choosing the 'magic' type by hand suggests marking it unidentified instead
    // (once per page load; autofill from the catalog never comes through here)
    if (
      field === 'type' &&
      value === 'magic' &&
      !data.unidentified &&
      !magicDialogShown &&
      !data.parseItem &&
      !data.itemId
    ) {
      setShowMagicMessage(true);
      setMagicDialogShown(true);
    }

    applyUpdates(updates);
  };

  const handleMarkAsUnidentified = () => {
    setShowMagicMessage(false);
    applyUpdates({ unidentified: true, type: '', parseItem: false, itemId: null });
  };

  const handleItemNameInput = (text: string) => {
    // Retyping a name picked from the catalog drops the catalog link and what it filled in
    applyUpdates(
      data.itemId != null ? { name: text, itemId: null, type: '', value: null } : { name: text }
    );
    loadSuggestions(text);
  };

  const handleItemSelected = (newValue: string | ItemSuggestion | null) => {
    const selectedItem =
      typeof newValue === 'string'
        ? itemSuggestions.find(item => item.name.toLowerCase() === newValue.toLowerCase())
        : newValue;

    if (selectedItem) {
      // One batched update: autofill must not trigger the magic-type tip
      applyUpdates({
        name: selectedItem.name,
        itemId: selectedItem.id,
        type: selectedItem.type || '',
        value: selectedItem.value || null,
      });
    } else {
      applyUpdates({
        name: typeof newValue === 'string' ? newValue : '',
        itemId: null,
        type: '',
        value: null,
      });
    }
  };

  const renderSessionDate = () => (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <DatePicker
        label="Session Date"
        value={parseStoredDate(data.sessionDate)}
        onChange={date => handleChange('sessionDate', formatStoredDate(date))}
        slotProps={{ textField: { fullWidth: true } }}
      />
    </LocalizationProvider>
  );

  const renderBoxedCheckbox = (field: 'unidentified' | 'masterwork', label: string) => (
    <Paper
      variant="outlined"
      sx={{ p: 1, display: 'flex', alignItems: 'center', height: '56px' }}
    >
      <FormControlLabel
        control={
          <Checkbox
            checked={data[field] || false}
            onChange={e => handleChange(field, e.target.checked)}
          />
        }
        label={label}
        sx={{ m: 0 }}
      />
    </Paper>
  );

  const renderItemForm = () => (
    <Grid container spacing={2}>
      {/* First Line: Session Date, Quantity (same size as Type/Size), Item Name (remaining) */}
      <Grid size={{ xs: 12, sm: 1.5 }}>{renderSessionDate()}</Grid>
      <Grid size={{ xs: 12, sm: 1.5 }}>
        <TextField
          label="Quantity"
          type="number"
          fullWidth
          value={data.quantity ?? ''}
          onChange={e => handleChange('quantity', e.target.value)}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 9 }}>
        <Autocomplete
          freeSolo
          options={itemSuggestions}
          value={data.name || ''}
          inputValue={data.name || ''}
          onInputChange={(event, newInputValue, reason) => {
            // 'reset' (an option was picked) is handled by onChange, 'clear' too
            if (reason === 'input') handleItemNameInput(newInputValue);
          }}
          onChange={(event, newValue) => handleItemSelected(newValue)}
          filterOptions={(options, { inputValue }) =>
            options.filter(option =>
              option.name.toLowerCase().includes(inputValue.toLowerCase())
            )
          }
          getOptionLabel={option =>
            typeof option === 'string' ? option : option.name || ''
          }
          renderInput={params => (
            <TextField {...params} label="Item Name" fullWidth />
          )}
        />
      </Grid>
      {/* Second Line: Type (reduced), Size (reduced), Wand Charges, Checkboxes, Smart Detection */}
      <Grid size={{ xs: 12, sm: 1.5 }}>
        <FormControl fullWidth>
          <InputLabel>Type</InputLabel>
          <Select
            value={data.type || ''}
            onChange={e => handleChange('type', e.target.value)}
            disabled={data.itemId !== null && data.itemId !== undefined}
            label="Type"
          >
            <MenuItem value="">None</MenuItem>
            {ITEM_TYPES.map(({ value, label }) => (
              <MenuItem key={value} value={value}>{label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid size={{ xs: 12, sm: 1.5 }}>
        <FormControl fullWidth>
          <InputLabel>Size</InputLabel>
          <Select
            value={data.size || ''}
            onChange={e => handleChange('size', e.target.value)}
            label="Size"
          >
            <MenuItem value="">None</MenuItem>
            {ITEM_SIZES.map(size => (
              <MenuItem key={size} value={size}>{size}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>

      {/* Wand Charges (if applicable) */}
      {data.name && data.name.toLowerCase().startsWith('wand of ') && (
        <Grid size={{ xs: 12, sm: 2 }}>
          <TextField
            label="Charges"
            type="number"
            fullWidth
            value={data.charges || ''}
            onChange={e => handleChange('charges', e.target.value)}
            slotProps={{ htmlInput: { min: 1, max: 50 } }}
            helperText="1 to 50 charges"
          />
        </Grid>
      )}

      <Grid size={{ xs: 6, sm: 1.5 }}>{renderBoxedCheckbox('unidentified', 'Unidentified')}</Grid>
      <Grid size={{ xs: 6, sm: 1.5 }}>{renderBoxedCheckbox('masterwork', 'Masterwork')}</Grid>
      <Grid size={{ xs: 12, sm: 3 }}>
        <Paper
          variant="outlined"
          sx={{
            p: 1,
            display: 'inline-flex',
            alignItems: 'center',
            height: '56px',
          }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={data.parseItem || false}
                onChange={e => handleChange('parseItem', e.target.checked)}
                disabled={Boolean(data.unidentified) || !hasOpenAiKey}
              />
            }
            label="Smart Item Detection"
            sx={{ m: 0 }}
          />
          {(data.unidentified || !hasOpenAiKey) && (
            <Typography variant="caption" color="error" sx={{ ml: 1 }}>
              {data.unidentified
                ? 'Not available for unidentified items'
                : 'OpenAI key required in System Settings'}
            </Typography>
          )}
        </Paper>
      </Grid>

      {/* Third Line: Notes (full width) */}
      <Grid size={12}>
        <TextField
          label="Notes"
          fullWidth
          multiline
          rows={2}
          value={data.notes || ''}
          onChange={e => handleChange('notes', e.target.value)}
        />
      </Grid>
    </Grid>
  );

  const renderGoldForm = () => (
    <Grid container spacing={2}>
      {/* First Line: Session Date, Platinum, Gold, Silver, Copper */}
      <Grid size={{ xs: 12, sm: 1.5 }}>{renderSessionDate()}</Grid>
      {COIN_FIELDS.map(({ field, label }) => (
        <Grid key={field} size={{ xs: 12, sm: 2.625 }}>
          <TextField
            label={label}
            type="number"
            fullWidth
            slotProps={{ htmlInput: { min: 0 } }}
            value={data[field] || ''}
            onChange={e => handleChange(field, Math.max(0, parseInt(e.target.value) || 0))}
          />
        </Grid>
      ))}

      {/* Second Line: Transaction Type, Character (DM only), Notes */}
      <Grid size={{ xs: 12, sm: 4 }}>
        <FormControl fullWidth>
          <InputLabel>Transaction Type</InputLabel>
          <Select
            value={data.transactionType || ''}
            onChange={e => handleChange('transactionType', e.target.value)}
            label="Transaction Type"
          >
            {GOLD_TRANSACTION_TYPES.map(type => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      {isDM && (
        <Grid size={{ xs: 12, sm: 4 }}>
          <FormControl fullWidth>
            <InputLabel>Character (optional)</InputLabel>
            <Select
              value={data.characterId || ''}
              onChange={e => handleChange('characterId', e.target.value)}
              label="Character (optional)"
            >
              <MenuItem value="">
                <em>None (party / unattributed)</em>
              </MenuItem>
              {characters.map(c => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      )}
      <Grid size={{ xs: 12, sm: isDM ? 4 : 8 }}>
        <TextField
          label="Notes"
          fullWidth
          multiline
          rows={2}
          value={data.notes || ''}
          onChange={e => handleChange('notes', e.target.value)}
        />
      </Grid>
      {!isDM && (
        <Grid size={12}>
          <Typography variant="caption" sx={{
            color: "text.secondary"
          }}>
            This gold entry will be recorded under your active character.
          </Typography>
        </Grid>
      )}
    </Grid>
  );

  return (
    <Paper sx={{ p: 2, mb: 2, position: 'relative' }}>
      <IconButton
        aria-label="delete"
        onClick={onRemove}
        sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
      >
        <DeleteIcon />
      </IconButton>

      <Box sx={{ pr: 5 }}>
      {entry.type === 'item' ? renderItemForm() : renderGoldForm()}

      {entry.error && (
        <Box sx={{ mt: 2 }}>
          <Typography color="error">{entry.error}</Typography>
        </Box>
      )}

      {/* Magic Type Message */}
      {showMagicMessage && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            bgcolor: 'warning.dark',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'warning.main',
          }}
        >
          <Typography
            variant="body2"
            sx={{ mb: 1, color: 'warning.contrastText' }}
          >
            <strong>💡 Tip:</strong> You selected &quot;Magic&quot; as the item
            type. For items that haven&apos;t been identified yet, consider
            marking them as &quot;Unidentified&quot; instead. This helps track
            which items still need identification rolls.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button
              size="small"
              variant="outlined"
              color="primary"
              onClick={handleMarkAsUnidentified}
            >
              Mark as Unidentified
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={() => setShowMagicMessage(false)}
            >
              Keep as Magic
            </Button>
          </Box>
        </Box>
      )}
      </Box>
    </Paper>
  );
};

export default EntryForm;
