import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Container, Paper, Typography } from '@mui/material';
import CustomLootTable from './CustomLootTable'; // Adjust the path as necessary

const GivenAwayOrTrashed = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [individualLoot, setIndividualLoot] = useState([]);

  useEffect(() => {
    const fetchLoot = async () => {
      const token = localStorage.getItem('token');
      try {
        const response = await axios.get('http://192.168.0.64:5000/api/loot/trash', {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Fetched Loot:', response.data); // Log fetched data

        // Ensure response.data is in the expected format
        if (response.data && response.data.summary && response.data.individual) {
          const trashedLoot = response.data.individual.filter(item => item.status === 'Trashed');
          setLoot(response.data);
          setIndividualLoot(trashedLoot);
        } else {
          console.error('Unexpected response format:', response.data);
        }
      } catch (error) {
        console.error('Error fetching loot:', error);
        setLoot({ summary: [], individual: [] }); // Ensure loot is an object with summary and individual arrays
      }
    };

    fetchLoot();
  }, []);

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Given Away or Trashed</Typography>
      </Paper>
      <CustomLootTable
        loot={loot.summary}
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
