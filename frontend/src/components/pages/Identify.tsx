import React, { useEffect, useMemo, useState } from 'react';
import lootService from '../../services/lootService';
import { notifyLootCountsChanged } from '../../utils/events';
import { getErrorMessage } from '../../utils/apiErrors';
import { handleSelectItem } from '../../utils/utils';
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CustomLootTable from '../common/CustomLootTable';
import { useAuth } from '../../contexts/AuthContext';
import { useIsDM } from '../../contexts/CampaignContext';

interface LootItem {
  id: number;
  itemid?: number;
  name: string;
  description?: string;
  value?: number;
  whohas?: string;
  identified?: boolean;
  unidentified?: boolean;
  quantity?: number;
  character_name?: string;
  type?: string;
  size?: string;
  session_date?: string;
  lastupdate?: string;
  row_type?: string;
}

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

/** The server's roll for one item: d20, the bonus we sent, their sum and the DC. */
interface RollDetails {
  roll?: number;
  bonus?: number;
  total?: number;
  requiredDC?: number;
}

interface IdentifiedRow extends RollDetails {
  itemId: number;
  oldName: string;
  newName: string;
  cursedDetected?: boolean;
}

interface FailedRow extends RollDetails {
  itemId: number;
  name: string;
  /** Set when the server could not process the item at all (not just a low roll) */
  error?: string;
}

/** Result of POST /appraisal/identify (IdentificationService.identifyItems). */
interface IdentifyResponse {
  identified?: Array<RollDetails & {
    id: number;
    oldName?: string;
    newName: string;
    cursedDetected?: boolean;
  }>;
  failed?: Array<RollDetails & {
    id: number;
    name?: string;
    error?: string;
  }>;
  alreadyAttempted?: Array<{ id: number; message?: string }>;
}

// The server rolls the d20 (owner decision 2026-10-06); the client sends only the bonus.
const MIN_SPELLCRAFT_BONUS = -10;
const MAX_SPELLCRAFT_BONUS = 60;
const BONUS_ERROR = `Spellcraft bonus must be a whole number from ${MIN_SPELLCRAFT_BONUS} to ${MAX_SPELLCRAFT_BONUS}`;

/** A blank field means a bonus of 0; anything else must be a whole number in range. */
const parseSpellcraftBonus = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  if (!/^-?[0-9]+$/.test(trimmed)) return null;
  const bonus = Number(trimmed);
  return bonus >= MIN_SPELLCRAFT_BONUS && bonus <= MAX_SPELLCRAFT_BONUS ? bonus : null;
};

/** Append the rows whose itemId is not already listed. */
const appendUnique = <T extends { itemId: number }>(previous: T[], added: T[]): T[] => [
  ...previous,
  ...added.filter(row => !previous.some(existing => existing.itemId === row.itemId)),
];

const Identify: React.FC = () => {
  const [items, setItems] = useState<LootItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [spellcraftValue, setSpellcraftValue] = useState<string>('');
  const [openItems, setOpenItems] = useState<Record<number, boolean>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: '',
    direction: 'asc',
  });
  const [identifiedItems, setIdentifiedItems] = useState<IdentifiedRow[]>([]);
  const [failedItems, setFailedItems] = useState<FailedRow[]>([]);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const { user: authUser } = useAuth();
  const isDMUser = useIsDM();

  useEffect(() => {
    fetchLoot();

    const savedSpellcraft = localStorage.getItem('spellcraftBonus');
    if (savedSpellcraft) {
      setSpellcraftValue(savedSpellcraft);
    }
  }, []);

  const fetchLoot = async (): Promise<void> => {
    try {
      // The endpoint returns { items: [], pagination: {} }: unidentified items
      // that can actually be identified (the backend filters on itemid)
      const response = await lootService.getUnidentifiedItems({ identifiableOnly: 'true' });
      setItems(response.data?.items || []);
    } catch {
      setError('Error fetching unidentified items. Please try again later.');
    }
  };

  const handleSpellcraftChange = (value: string) => {
    setSpellcraftValue(value);
    // Save to localStorage whenever the value changes
    // eslint-disable-next-line no-undef
    localStorage.setItem('spellcraftBonus', value);
  };

  const handleIdentify = async (itemsToIdentify: number[]): Promise<void> => {
    setError('');
    setSuccess('');

    if (!itemsToIdentify || itemsToIdentify.length === 0) {
      setError('No items selected for identification');
      return;
    }

    const activeCharacterId = authUser?.activeCharacterId;
    if (!isDMUser && !activeCharacterId) {
      setError('Active character required for identification');
      return;
    }

    const bonus = isDMUser ? 0 : parseSpellcraftBonus(spellcraftValue);
    if (bonus === null) {
      setError(BONUS_ERROR);
      setSelectedItems([]);
      return;
    }

    try {
      // A DM identification (automatic success) sends no roll; the server decides
      // from the caller's DM rights. Players send only their Spellcraft bonus: the
      // server rolls the d20 for every item and returns the roll it used.
      const response = await lootService.identifyItems({
        items: itemsToIdentify,
        characterId: isDMUser ? null : activeCharacterId ?? null,
        ...(isDMUser ? { dmIdentify: true } : { spellcraftBonus: bonus }),
      });
      const result: IdentifyResponse = response.data || {};

      if (result.alreadyAttempted?.length) {
        setError(`You've already attempted to identify ${result.alreadyAttempted.length} item(s) today.`);
      }

      const nameOf = (id: number) => items.find(i => i.id === id)?.name;

      if (result.identified?.length) {
        const rows: IdentifiedRow[] = result.identified.map(item => ({
          itemId: item.id,
          oldName: item.oldName || nameOf(item.id) || 'Unknown',
          newName: item.newName,
          roll: item.roll,
          bonus: item.bonus,
          total: item.total,
          requiredDC: item.requiredDC,
          cursedDetected: item.cursedDetected,
        }));
        setIdentifiedItems(prev => appendUnique(prev, rows));
      }

      if (result.failed?.length) {
        const rows: FailedRow[] = result.failed.map(item => ({
          itemId: item.id,
          name: item.name || nameOf(item.id) || 'Unknown',
          roll: item.roll,
          bonus: item.bonus,
          total: item.total,
          requiredDC: item.requiredDC,
          error: item.error,
        }));
        setFailedItems(prev => appendUnique(prev, rows));
      }

      // Refresh loot data after identification attempts
      await fetchLoot();
      // Notify the sidebar so the unidentified-items badge drops in real time.
      notifyLootCountsChanged();

      const successCount = result.identified?.length || 0;
      const failCount = result.failed?.length || 0;
      if (successCount > 0 || failCount > 0) {
        const parts: string[] = [];
        if (successCount > 0) parts.push(`Successfully identified ${successCount} item(s).`);
        if (failCount > 0) parts.push(`Failed to identify ${failCount} item(s).`);
        setSuccess(parts.join(' '));
      }
    } catch (apiError) {
      const message = getErrorMessage(apiError, '');
      if (message.includes('already attempted today')) {
        setError('You have already attempted to identify these items today.');
      } else {
        setError(message || 'Error identifying items. Please try again.');
      }
    } finally {
      // Clear the selection so a bad selection is not retried by accident
      setSelectedItems([]);
    }
  };

  // CustomLootTable renders summary rows; here every unidentified item is its own row
  const summaryRows = useMemo(
    () =>
      items.map(item => ({
        ...item,
        row_type: 'summary' as const,
        quantity: item.quantity || 1,
        character_names: item.character_name ? [item.character_name] : ([] as string[]),
      })),
    [items]
  );

  return (
    <Container maxWidth={false} component="main">
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <CustomLootTable
        loot={summaryRows}
        individualLoot={items}
        selectedItems={selectedItems}
        openItems={openItems}
        setOpenItems={setOpenItems}
        handleSelectItem={(id: number) => handleSelectItem(id, setSelectedItems)}
        sortConfig={sortConfig}
        setSortConfig={setSortConfig}
        showColumns={{
          select: true,
          quantity: true,
          name: true,
          type: true,
          sessionDate: true,
          lastUpdate: false,
          unidentified: false,
          pendingSale: false,
          whoHasIt: false,
          believedValue: false,
          averageAppraisal: false,
          size: false,
        }}
        showFilters={{
          pendingSale: false,
          unidentified: false,
          type: true,
          size: false,
          whoHas: false,
        }}
      />

      {identifiedItems.length > 0 && (
        <Paper sx={{ p: 2, mt: 2, mb: 2 }}>
          <Typography variant="h6">Successfully Identified Items</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Old Name</TableCell>
                  <TableCell>New Name</TableCell>
                  <TableCell>d20 Roll</TableCell>
                  <TableCell>Bonus</TableCell>
                  <TableCell>Total</TableCell>
                  <TableCell>DC</TableCell>
                  <TableCell>Special</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {identifiedItems.map(item => (
                  <TableRow key={item.itemId}>
                    <TableCell>{item.oldName}</TableCell>
                    <TableCell>{item.newName}</TableCell>
                    <TableCell>{item.roll ?? '-'}</TableCell>
                    <TableCell>{item.bonus ?? '-'}</TableCell>
                    <TableCell>{item.total ?? '-'}</TableCell>
                    <TableCell>{item.requiredDC ?? '-'}</TableCell>
                    <TableCell>
                      {item.cursedDetected && (
                        <span style={{ color: 'red', fontWeight: 'bold' }}>
                          CURSED DETECTED!
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {failedItems.length > 0 && (
        <Paper sx={{ p: 2, mt: 2, mb: 2 }}>
          <Typography variant="h6">Failed Identification Attempts</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Item Name</TableCell>
                  <TableCell>d20 Roll</TableCell>
                  <TableCell>Bonus</TableCell>
                  <TableCell>Total</TableCell>
                  <TableCell>DC</TableCell>
                  <TableCell>Result</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {failedItems.map(item => (
                  <TableRow key={item.itemId}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.error ? '-' : item.roll ?? '-'}</TableCell>
                    <TableCell>{item.error ? '-' : item.bonus ?? '-'}</TableCell>
                    <TableCell>{item.error ? '-' : item.total ?? '-'}</TableCell>
                    <TableCell>{item.error ? '-' : item.requiredDC ?? '-'}</TableCell>
                    <TableCell>{item.error ? `Error: ${item.error}` : 'Failed (roll too low)'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          bgcolor: 'background.paper',
          boxShadow: 3,
          p: 2,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 2,
          zIndex: 1000,
        }}
      >
        {!isDMUser && (
          <TextField
            label="Spellcraft bonus"
            type="number"
            value={spellcraftValue}
            onChange={e => handleSpellcraftChange(e.target.value)}
            helperText="The server rolls the d20"
            slotProps={{ htmlInput: { min: MIN_SPELLCRAFT_BONUS, max: MAX_SPELLCRAFT_BONUS, step: 1 } }}
            sx={{ width: '190px' }}
          />
        )}
        <Button
          variant="outlined"
          color="primary"
          onClick={() => handleIdentify(selectedItems)}
          disabled={selectedItems.length === 0}
        >
          Identify
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          onClick={() => handleIdentify(items.map(item => item.id))}
          disabled={items.length === 0}
        >
          Identify All
        </Button>
      </Box>
    </Container>
  );
};

export default Identify;
