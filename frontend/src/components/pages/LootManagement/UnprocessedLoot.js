import React from 'react';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
} from '@mui/material';
import CustomLootTable from '../../common/CustomLootTable';
import CustomSplitStackDialog from '../../common/dialogs/CustomSplitStackDialog';
import CustomUpdateDialog from '../../common/dialogs/CustomUpdateDialog';
import useLootManagement from '../../../hooks/useLootManagement';

const UnprocessedLoot = () => {
  const {
    loot,
    selectedItems,
    setSelectedItems,
    openUpdateDialog,
    openSplitDialog,
    splitQuantities,
    updatedEntry,
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
    handleAppraise,
    handleSell,
    handleTrash,
    handleKeepSelf,
    handleKeepParty,
  } = useLootManagement(); // No status for unprocessed loot

  return (
    <Container maxWidth={false} component="main" sx={{ pb: '80px' }}>
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
        showColumns={{
          select: true,
          quantity: true,
          name: true,
          type: true,
          size: true,
          whoHasIt: false,
          believedValue: true,
          averageAppraisal: true,
          sessionDate: true,
          lastUpdate: true,
          unidentified: true,
          pendingSale: true
        }}
        showFilters={{
          pendingSale: true,
          unidentified: true,
          type: true,
          size: true,
          whoHas: false,
        }}
      />

      {/* Floating button container */}
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
        <Button variant="outlined" color="primary" onClick={() => handleAction(handleSell)}>Sell</Button>
        <Button variant="outlined" color="secondary" onClick={() => handleAction(handleTrash)}>Trash</Button>
        <Button variant="outlined" color="primary" onClick={() => handleAction(handleKeepSelf)}>Keep Self</Button>
        <Button variant="outlined" color="primary" onClick={() => handleAction(handleKeepParty)}>Keep Party</Button>
        <Button variant="outlined" color="primary" onClick={handleAppraise}>Appraise</Button>
        {selectedItems.length === 1 && loot.individual.find(item => item.id === selectedItems[0] && item.quantity > 1) && (
          <Button variant="contained" color="primary" onClick={() => handleOpenSplitDialogWrapper(loot.individual.find(item => item.id === selectedItems[0]))}>
            Split Stack
          </Button>
        )}
        {selectedItems.length === 1 && (
          <Button variant="contained" color="primary" onClick={handleUpdateDialogWrapper}>
            Update
          </Button>
        )}
      </Box>

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

export default UnprocessedLoot;