import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  Container,
  Paper,
  Typography,
} from '@mui/material';
import CustomLootTable from '../common/CustomLootTable';
import {
  fetchActiveUser,
  handleSelectItem,
  applyFilters,
} from '../../utils/utils';

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState({
    summary: [],
    individual: []
  }), [selectedItems, setSelectedItems] = useState([]), [, setActiveUser] = useState(null), [filters] = useState({
    unidentified: '',
    type: '',
    size: '',
    pendingSale: ''
  }), [openItems, setOpenItems] = useState({}), [sortConfig, setSortConfig] = useState({key: '', direction: 'asc'});

  useEffect(() => {
    fetchLoot();
    fetchActiveUserDetails();
  }, []);

  const fetchLoot = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/loot/trash`);
      setLoot(response.data);
    } catch (error) {
      console.error('Error fetching loot:', error);
    }
  };

  const fetchActiveUserDetails = async () => {
    const user = await fetchActiveUser();
    if (user && user.activeCharacterId) {
      setActiveUser(user);
    } else {
      console.error('Active character ID is not available or user could not be fetched');
    }
  };
  const filteredLoot = applyFilters(loot, filters);

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Trashed or Given Away Loot</Typography>
      </Paper>
      <CustomLootTable
        loot={filteredLoot.summary}
        individualLoot={filteredLoot.individual}
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

export default UnprocessedLoot;
