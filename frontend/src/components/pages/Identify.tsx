import React, { useEffect, useMemo, useState } from 'react';
import lootService from '../../services/lootService';
import { notifyLootCountsChanged } from '../../utils/events';
import { getErrorMessage } from '../../utils/apiErrors';
import { handleSelectItem } from '../../utils/utils';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Container,
  FormControlLabel,
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

interface IdentifiedRow {
  itemId: number;
  oldName: string;
  newName: string;
  spellcraftRoll: number;
  cursedDetected?: boolean;
}

interface FailedRow {
  itemId: number;
  name: string;
  spellcraftRoll?: number;
  /** Set when the server could not process the item at all (not just a low roll) */
  error?: string;
}

/** Result of POST /appraisal/identify (IdentificationService.identifyItems). */
interface IdentifyResponse {
  identified?: Array<{
    id: number;
    oldName?: string;
    newName: string;
    spellcraftRoll: number;
    cursedDetected?: boolean;
  }>;
  failed?: Array<{
    id: number;
    name?: string;
    spellcraftRoll?: number;
    error?: string;
  }>;
  alreadyAttempted?: Array<{ id: number; message?: string }>;
}

const rollD20 = (): number => Math.floor(Math.random() * 20) + 1;

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
  const [takeTen, setTakeTen] = useState<boolean>(false);
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

    try {
      // A DM identification (automatic success) sends no roll; the server decides
      // from the caller's DM rights. Players roll a d20 (or take 10) plus bonus.
      const bonus = parseInt(spellcraftValue || '0', 10) || 0;
      const response = await lootService.identifyItems({
        items: itemsToIdentify,
        characterId: isDMUser ? null : activeCharacterId ?? null,
        ...(isDMUser
          ? { dmIdentify: true }
          : {
              spellcraftRolls: itemsToIdentify.map(() => (takeTen ? 10 : rollD20()) + bonus),
            }),
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
          spellcraftRoll: item.spellcraftRoll,
          cursedDetected: item.cursedDetected,
        }));
        setIdentifiedItems(prev => appendUnique(prev, rows));
      }

      if (result.failed?.length) {
        const rows: FailedRow[] = result.failed.map(item => ({
          itemId: item.id,
          name: item.name || nameOf(item.id) || 'Unknown',
          spellcraftRoll: item.spellcraftRoll,
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
                  <TableCell>Spellcraft Roll</TableCell>
                  <TableCell>Special</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {identifiedItems.map(item => (
                  <TableRow key={item.itemId}>
                    <TableCell>{item.oldName}</TableCell>
                    <TableCell>{item.newName}</TableCell>
                    <TableCell>{item.spellcraftRoll}</TableCell>
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
                  <TableCell>Spellcraft Roll</TableCell>
                  <TableCell>Result</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {failedItems.map(item => (
                  <TableRow key={item.itemId}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.error ? '-' : item.spellcraftRoll}</TableCell>
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
          <>
            <TextField
              label="Spellcraft"
              type="number"
              value={spellcraftValue}
              onChange={e => handleSpellcraftChange(e.target.value)}
              sx={{ width: '150px' }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={takeTen}
                  onChange={e => setTakeTen(e.target.checked)}
                />
              }
              label="Take 10"
            />
          </>
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
