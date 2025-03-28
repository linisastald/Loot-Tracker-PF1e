import React from 'react';
import {
  Container,
  Paper,
  Typography,
} from '@mui/material';
import CustomLootTable from '../../common/CustomLootTable';
import useLootManagement from '../../../hooks/useLootManagement';

const GivenAwayOrTrashed = () => {
  const {
    loot,
    selectedItems,
    setSelectedItems,
    openItems,
    setOpenItems,
    sortConfig,
    setSortConfig,
    handleSelectItem,
  } = useLootManagement('Trashed');

  return (
    <Container maxWidth={false} component="main">
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
          select: false,
          quantity: true,
          name: true,
          type: true,
          size: false,
          whoHasIt: false,
          believedValue: false,
          averageAppraisal: false,
          sessionDate: true,
          lastUpdate: true,
          unidentified: false,
          pendingSale: false
        }}
        showFilters={{
          pendingSale: false,
          unidentified: false,
          type: true,
          size: false,
          whoHas: false,
        }}
      />
    </Container>
  );
};

export default GivenAwayOrTrashed;