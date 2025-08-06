import React from 'react';
import { Box, Button, Container } from '@mui/material';
import CustomLootTable from '../../common/CustomLootTable';
import CustomSplitStackDialog from '../../common/dialogs/CustomSplitStackDialog';
import CustomUpdateDialog from '../../common/dialogs/CustomUpdateDialog';
import useLootManagement from '../../../hooks/useLootManagement';
import { LootManagementConfig } from '../../../types/game';

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
        filters={config.hasFilters ? filters : undefined}
        setFilters={config.hasFilters ? setFilters : undefined}
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
                onClick={() => handleAction(action.handler)}
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