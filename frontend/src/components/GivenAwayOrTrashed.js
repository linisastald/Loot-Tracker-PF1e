import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Container, Paper, Typography } from '@mui/material';
import CustomLootTable from './CustomLootTable'; // Adjust the path as necessary

const GivenAwayOrTrashed = () => {
  const [loot, setLoot] = useState([]);
  const [individualLoot, setIndividualLoot] = useState([]);

  useEffect(() => {
    const fetchLoot = async () => {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://192.168.0.64:5000/api/loot/trash', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const trashedLoot = response.data.filter(item => item.status === 'Trashed');
      setLoot(trashedLoot);
      setIndividualLoot(trashedLoot); // Assuming each item is an individual item in this context
    };

    fetchLoot();
  }, []);

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Given Away or Trashed</Typography>
      </Paper>
      <CustomLootTable
        loot={loot}
        individualLoot={individualLoot}
        selectedItems={[]}
        setSelectedItems={() => {}}
        openItems={{}}
        setOpenItems={() => {}}
        handleSelectItem={() => {}}
        handleSort={() => {}}
        sortConfig={{ key: 'lastupdate', direction: 'desc' }}
        showColumns={{ select: false, unidentified: false, pendingSale: false }} // Specify columns to hide
      />
    </Container>
  );
};

export default GivenAwayOrTrashed;
