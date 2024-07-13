import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Paper,
  Typography,
  Grid,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Button
} from '@mui/material';
import CustomLootTable from './CustomLootTable'; // Adjust the path as necessary
import CustomUpdateDialog from './dialogs/CustomUpdateDialog'; // Adjust the path as necessary
import CustomSplitStackDialog from './dialogs/CustomSplitStackDialog'; // Adjust the path as necessary
import {
  fetchActiveUser,
  handleSelectItem,
  handleSell,
  handleTrash,
  handleKeepParty,
  handleOpenUpdateDialog,
  handleOpenSplitDialog,
  handleUpdateChange,
  handleSplitChange,
  handleAddSplit,
  handleSplitSubmit,
  handleUpdate,
  handleFilterChange
} from '../utils/utils'; // Adjust the path as necessary

const KeptCharacter = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [characterFilter, setCharacterFilter] = useState('');
  const [characters, setCharacters] = useState([]);
  const [openUpdateDialog, setOpenUpdateDialog] = useState(false);
  const [openSplitDialog, setOpenSplitDialog] = useState(false);
  const [updatedEntry, setUpdatedEntry] = useState({});
  const [splitQuantities, setSplitQuantities] = useState([]);
  const [activeUser, setActiveUser] = useState(null);
  const [openItems, setOpenItems] = useState({});

  useEffect(() => {
    const fetchLoot = async () => {
      const token = localStorage.getItem('token');
      try {
        const response = await axios.get(`http://192.168.0.64:5000/api/loot/kept-character`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log('Fetched Loot:', response.data); // Log fetched data
        setLoot(response.data);
        const uniqueCharacters = [...new Set(response.data.individual.map(item => item.character_name))];
        setCharacters(uniqueCharacters);
      } catch (error) {
        console.error('Error fetching loot:', error);
        setLoot({ summary: [], individual: [] }); // Ensure loot is an object with summary and individual arrays
      }
    };

    fetchLoot();
    fetchActiveUser(setActiveUser);
  }, []);

  useEffect(() => {
    console.log('Loot State Updated:', loot); // Log updated loot state
  }, [loot]);

  const filteredLoot = loot.summary?.filter(item => {
    return (
      (typeFilter ? item.type === typeFilter : true) &&
      (sizeFilter ? item.size === sizeFilter : true) &&
      (characterFilter ? item.character_name === characterFilter : true)
    );
  }) || [];

  const handleSplitDialogClose = () => {
    setOpenSplitDialog(false);
    setSplitQuantities([]);
  };

  const handleUpdateDialogClose = () => {
    setOpenUpdateDialog(false);
    setUpdatedEntry({});
  };

  return (
    <Container component="main" sx={{ maxWidth: '100vw', overflowX: 'auto' }}>
      <Paper sx={{ p: 2, mb: 2, maxWidth: '100vw', overflowX: 'auto'  }}>
        <Typography variant="h6">Kept - Character</Typography>
      </Paper>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              name="type"
              value={typeFilter}
              onChange={(e) => handleFilterChange(e, setTypeFilter, setSizeFilter, setCharacterFilter)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="Weapon">Weapon</MenuItem>
              <MenuItem value="Armor">Armor</MenuItem>
              <MenuItem value="Magic">Magic</MenuItem>
              <MenuItem value="Gear">Gear</MenuItem>
              <MenuItem value="Trade Good">Trade Good</MenuItem>
              <MenuItem value="Other">Other</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel>Size</InputLabel>
            <Select
              name="size"
              value={sizeFilter}
              onChange={(e) => handleFilterChange(e, setTypeFilter, setSizeFilter, setCharacterFilter)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="Fine">Fine</MenuItem>
              <MenuItem value="Diminutive">Diminutive</MenuItem>
              <MenuItem value="Tiny">Tiny</MenuItem>
              <MenuItem value="Small">Small</MenuItem>
              <MenuItem value="Medium">Medium</MenuItem>
              <MenuItem value="Large">Large</MenuItem>
              <MenuItem value="Huge">Huge</MenuItem>
              <MenuItem value="Gargantuan">Gargantuan</MenuItem>
              <MenuItem value="Colossal">Colossal</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={4}>
          <FormControl fullWidth>
            <InputLabel>Who Has It?</InputLabel>
            <Select
              name="character"
              value={characterFilter}
              onChange={(e) => handleFilterChange(e, setTypeFilter, setSizeFilter, setCharacterFilter)}
            >
              <MenuItem value="">All</MenuItem>
              {characters.map((character, index) => (
                <MenuItem key={index} value={character}>
                  {character}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>
      <CustomLootTable
        loot={filteredLoot}
        individualLoot={loot.individual}
        selectedItems={selectedItems}
        setSelectedItems={setSelectedItems}
        openItems={openItems}
        setOpenItems={setOpenItems}
        handleSelectItem={(id) => handleSelectItem(id, setSelectedItems)}
        handleSort={() => {}}
        sortConfig={{ key: 'lastupdate', direction: 'desc' }}
        showColumns={{
          select: true,
          quantity: true,
          name: true,
          type: true,
          size: true,
          whoHasIt: true,
          believedValue: true,
          averageAppraisal: true,
          sessionDate: true,
          lastUpdate: true,
          unidentified: false,
          pendingSale: false
        }} // Specify columns to show
      />
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }} onClick={() => handleSell(selectedItems, fetchLoot)}>
        Sell
      </Button>
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }} onClick={() => handleTrash(selectedItems, fetchLoot)}>
        Trash
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleKeepParty(selectedItems, fetchLoot)}>
        Keep Party
      </Button>
      {selectedItems.length === 1 && (
        <>
          <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleOpenUpdateDialog(setOpenUpdateDialog, loot.individual, selectedItems, setUpdatedEntry)}>
            Update
          </Button>
          {selectedItems[0] && loot.individual.find(item => item.id === selectedItems[0]).quantity > 1 && (
            <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleOpenSplitDialog(setOpenSplitDialog, loot.individual, selectedItems, setSplitQuantities)}>
              Split Stack
            </Button>
          )}
        </>
      )}
      <CustomUpdateDialog
        open={openUpdateDialog}
        onClose={handleUpdateDialogClose}
        updatedEntry={updatedEntry}
        onUpdateChange={(e) => handleUpdateChange(e, setUpdatedEntry)}
        onUpdateSubmit={() => handleUpdate(updatedEntry.id, updatedEntry, fetchLoot)}
      />
      <CustomSplitStackDialog
        open={openSplitDialog}
        handleClose={handleSplitDialogClose}
        splitQuantities={splitQuantities}
        handleSplitChange={(index, value) => handleSplitChange(index, value, setSplitQuantities)}
        handleAddSplit={() => handleAddSplit(setSplitQuantities)}
        handleSplitSubmit={() => handleSplitSubmit(setOpenSplitDialog, splitQuantities, fetchLoot)}
      />
    </Container>
  );
};

export default KeptCharacter;
