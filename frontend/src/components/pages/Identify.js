import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  TextField,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Checkbox,
} from '@mui/material';
import { fetchActiveUser } from '../../utils/utils';
import { formatDate } from '../../utils/utils';

const Identify = () => {
  const [unidentifiedItems, setUnidentifiedItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [spellcraftValue, setSpellcraftValue] = useState('');
  const [activeUser, setActiveUser] = useState(null);

  useEffect(() => {
    fetchActiveUserDetails();
    fetchUnidentifiedItems();
  }, []);

  const fetchActiveUserDetails = async () => {
    const user = await fetchActiveUser();
    if (user && user.activeCharacterId) {
      setActiveUser(user);
    } else {
      console.error('Active character ID is not available or user could not be fetched');
    }
  };

  const fetchUnidentifiedItems = async () => {
    try {
      const response = await api.get('/loot/unidentified', {
        params: { activeCharacterId: activeUser?.activeCharacterId }
      });
      setUnidentifiedItems(response.data);
    } catch (error) {
      console.error('Error fetching unidentified items:', error);
    }
  };

  const handleSelectItem = (id) => {
    setSelectedItems(prevSelectedItems =>
      prevSelectedItems.includes(id)
        ? prevSelectedItems.filter(item => item !== id)
        : [...prevSelectedItems, id]
    );
  };

  const handleIdentify = async (itemsToIdentify) => {
    try {
      await api.post('/loot/identify', {
        items: itemsToIdentify,
        characterId: activeUser.activeCharacterId,
        spellcraftValue: parseInt(spellcraftValue)
      });
      fetchUnidentifiedItems();
      setSelectedItems([]);
    } catch (error) {
      console.error('Error identifying items:', error);
    }
  };

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Identify Unidentified Items</Typography>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Select</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Session Date</TableCell>
              <TableCell>Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {unidentifiedItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedItems.includes(item.id)}
                    onChange={() => handleSelectItem(item.id)}
                  />
                </TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.type}</TableCell>
                <TableCell>{formatDate(item.session_date)}</TableCell>
                <TableCell>{item.notes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

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
        <TextField
          label="Spellcraft"
          type="number"
          value={spellcraftValue}
          onChange={(e) => setSpellcraftValue(e.target.value)}
          sx={{ width: '150px' }}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={() => handleIdentify(selectedItems)}
          disabled={selectedItems.length === 0}
        >
          Identify
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={() => handleIdentify(unidentifiedItems.map(item => item.id))}
          disabled={unidentifiedItems.length === 0}
        >
          Identify All
        </Button>
      </Box>
    </Container>
  );
};

export default Identify;