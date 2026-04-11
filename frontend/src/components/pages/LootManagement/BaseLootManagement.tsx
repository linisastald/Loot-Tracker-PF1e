import React from 'react';
import { Box, Button, Container } from '@mui/material';
import CustomLootTable from '../../common/CustomLootTable';
import CustomSplitStackDialog from '../../common/dialogs/CustomSplitStackDialog';
import CustomUpdateDialog from '../../common/dialogs/CustomUpdateDialog';
import useLootManagement from '../../../hooks/useLootManagement';
import lootService from '../../../services/lootService';
import { useAuth } from '../../../contexts/AuthContext';
import { LootActionKey, LootManagementConfig, LootStatus } from '../../../types/game';

interface BaseLootManagementProps {
  config: LootManagementConfig;
}

const BaseLootManagement: React.FC<BaseLootManagementProps> = ({ config }) => {
  const { user: authUser } = useAuth();
  const {
    loot,
    selectedItems,
    setSelectedItems,
    setOpenUpdateDialog,
    openUpdateDialog,
    openSplitDialog,
    splitQuantities,
    updatedEntry,
    openItems,
    setOpenItems,
    sortConfig,
    setSortConfig,
    fetchLoot,
    handleAppraise,
    handleSelectItem,
    handleOpenSplitDialogWrapper,
    handleSplitChange,
    handleAddSplit,
    handleUpdateDialogWrapper,
    handleUpdateDialogClose,
    handleSplitDialogClose,
    handleUpdateChange,
    handleSplitSubmitWrapper,
  } = useLootManagement(config.status);

  // Perform a status update and then EXPLICITLY await a refetch of the
  // loot state owned by this component. Previously, actions went through
  // utility closures that called fetchLoot() without awaiting, leaving
  // the timing of the refresh ambiguous (and in one earlier incarnation,
  // refreshing the wrong hook instance's state entirely).
  const performStatusChange = async (status: LootStatus) => {
    if (selectedItems.length === 0) return;
    try {
      await lootService.updateLootStatus({
        lootIds: selectedItems,
        status,
        characterId:
          (authUser as any)?.activeCharacterId || (authUser as any)?.id || 0,
      });
      await fetchLoot();
      setSelectedItems([]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Error updating loot status to ${status}:`, error);
    }
  };

  const actionHandlers: Record<LootActionKey, () => void | Promise<void>> = {
    appraise: async () => {
      await handleAppraise();
      setSelectedItems([]);
    },
    sell: () => performStatusChange('Pending Sale' as LootStatus),
    trash: () => performStatusChange('Trashed' as LootStatus),
    keepSelf: () => performStatusChange('Kept Character' as LootStatus),
    keepParty: () => performStatusChange('Kept Party' as LootStatus),
  };

  // Dedicated update-dialog submit that mirrors the action button flow:
  // API call → await refetch → close dialog → clear selection. The hook's
  // handleUpdateSubmitWrapper had a missing-arg bug AND did not await
  // fetchLoot, leaving the table to display stale data.
  const handleUpdateSubmit = async () => {
    if (!updatedEntry || !updatedEntry.id) return;
    try {
      await lootService.updateLootItem(updatedEntry.id, {
        session_date: updatedEntry.session_date,
        quantity: updatedEntry.quantity,
        name: updatedEntry.name,
        unidentified: updatedEntry.unidentified,
        masterwork: updatedEntry.masterwork,
        type: updatedEntry.type,
        size: updatedEntry.size,
        notes: updatedEntry.notes,
      });
      await fetchLoot();
      setOpenUpdateDialog(false);
      setSelectedItems([]);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error updating item:', error);
    }
  };

  // Determine if Split Stack button should be shown
  const showSplitStack = selectedItems.length === 1 &&
    loot.individual.find(item => item.id === selectedItems[0] && item.quantity > 1);

  // Determine if Update button should be shown
  const showUpdate = selectedItems.length === 1;

  return (
    <Container
      maxWidth={false}
      component="main"
      sx={{
        pb: selectedItems.length > 0 ? '80px' : 0,
        ...config.containerProps?.sx
      }}
    >
      <CustomLootTable
        loot={loot.summary}
        individualLoot={loot.individual}
        selectedItems={selectedItems}
        setSelectedItems={setSelectedItems}
        openItems={openItems}
        setOpenItems={setOpenItems}
        handleSelectItem={handleSelectItem}
        sortConfig={sortConfig}
        setSortConfig={setSortConfig}
        showColumns={config.showColumns}
        showFilters={config.showFilters}
      />

      {/* Floating button container - only show when items are selected */}
      {selectedItems.length > 0 && (
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
            gap: 1,
            zIndex: 1000,
          }}
        >
          {/* Render configured action buttons */}
          {config.actions.map((action, index) => (
            action.showCondition !== false && (
              <Button
                key={index}
                variant={action.variant}
                color={action.color}
                onClick={() => actionHandlers[action.actionKey]()}
              >
                {action.label}
              </Button>
            )
          ))}

          {/* Conditional system buttons */}
          {showSplitStack && (
            <Button
              variant="outlined"
              color="primary"
              onClick={() => handleOpenSplitDialogWrapper(
                loot.individual.find(item => item.id === selectedItems[0])!
              )}
            >
              Split Stack
            </Button>
          )}

          {showUpdate && (
            <Button
              variant="outlined"
              color="primary"
              onClick={handleUpdateDialogWrapper}
            >
              Update
            </Button>
          )}
        </Box>
      )}

      {/* Dialog components */}
      <CustomSplitStackDialog
        open={openSplitDialog}
        handleClose={handleSplitDialogClose}
        splitQuantities={splitQuantities}
        handleSplitChange={handleSplitChange}
        handleAddSplit={handleAddSplit}
        handleSplitSubmit={handleSplitSubmitWrapper}
      />

      <CustomUpdateDialog
        open={openUpdateDialog}
        onClose={handleUpdateDialogClose}
        updatedEntry={updatedEntry}
        onUpdateChange={handleUpdateChange}
        onUpdateSubmit={handleUpdateSubmit}
      />
    </Container>
  );
};

export default BaseLootManagement;
