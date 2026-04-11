import React from 'react';
import { Box, Button, Container } from '@mui/material';
import CustomLootTable from '../../common/CustomLootTable';
import CustomSplitStackDialog from '../../common/dialogs/CustomSplitStackDialog';
import CustomUpdateDialog from '../../common/dialogs/CustomUpdateDialog';
import useLootManagement from '../../../hooks/useLootManagement';
import {
  handleSell as handleSellUtil,
  handleTrash as handleTrashUtil,
  handleKeepSelf as handleKeepSelfUtil,
  handleKeepParty as handleKeepPartyUtil,
} from '../../../utils/utils';
import { LootActionKey, LootManagementConfig } from '../../../types/game';

interface BaseLootManagementProps {
  config: LootManagementConfig;
}

const BaseLootManagement: React.FC<BaseLootManagementProps> = ({ config }) => {
  const {
    loot,
    selectedItems,
    setSelectedItems,
    openUpdateDialog,
    openSplitDialog,
    splitQuantities,
    updatedEntry,
    filters,
    setFilters,
    openItems,
    setOpenItems,
    sortConfig,
    setSortConfig,
    handleAction,
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
    handleUpdateSubmitWrapper,
  } = useLootManagement(config.status);

  // Map action keys to handlers bound to THIS hook instance's state.
  // (Previously, pages called useLootManagement() separately to grab closures,
  // creating two independent hook instances — fetchLoot fired on the wrong one
  // and the visible table never refreshed.)
  const actionHandlers: Record<LootActionKey, () => void | Promise<void>> = {
    appraise: handleAppraise,
    sell: () => handleAction(handleSellUtil),
    trash: () => handleAction(handleTrashUtil),
    keepSelf: () => handleAction(handleKeepSelfUtil),
    keepParty: () => handleAction(handleKeepPartyUtil),
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
        onUpdateSubmit={handleUpdateSubmitWrapper}
      />
    </Container>
  );
};

export default BaseLootManagement;