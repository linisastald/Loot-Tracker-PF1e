import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Button,
  Grid,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField
} from '@mui/material';

const KeptParty = () => {
  const [loot, setLoot] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [openUpdateDialog, setOpenUpdateDialog] = useState(false);
  const [openSplitDialog, setOpenSplitDialog] = useState(false);
  const [updatedEntry, setUpdatedEntry] = useState({});
  const [splitData, setSplitData] = useState({ quantity: 0 });

  useEffect(() => {
    const fetchLoot = async () => {
      const token = localStorage.getItem('token');
      try {
        const response = await axios.get('http://192.168.0.64:5000/api/loot/kept-party', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setLoot(response.data);
      } catch (error) {
        console.error('Error fetching loot:', error);
        setLoot([]); // Ensure loot is an array even if the request fails
      }
    };

    fetchLoot();
  }, []);

  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    if (name === 'type') {
      setTypeFilter(value);
    } else if (name === 'size') {
      setSizeFilter(value);
    }
  };

  const handleSelectItem = (id) => {
    setSelectedItems((prevSelectedItems) =>
      prevSelectedItems.includes(id)
        ? prevSelectedItems.filter((itemId) => itemId !== id)
        : [...prevSelectedItems, id]
    );
  };

  const handleOpenUpdateDialog = () => {
    const selectedItem = loot.find(item => item.id === selectedItems[0]);
    setUpdatedEntry(selectedItem);
    setOpenUpdateDialog(true);
  };

  const handleOpenSplitDialog = () => {
    const selectedItem = loot.find(item => item.id === selectedItems[0]);
    setSplitData({ quantity: selectedItem.quantity });
    setOpenSplitDialog(true);
  };

  const handleUpdateChange = (e) => {
    const { name, value } = e.target;
    setUpdatedEntry((prevState) => ({
      ...prevState,
      [name]: value === '' ? null : value,
    }));
  };

  const handleUpdateSubmit = async () => {
    const token = localStorage.getItem('token');
    try {
      await axios.put(`http://192.168.0.64:5000/api/loot/${updatedEntry.id}`, updatedEntry, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOpenUpdateDialog(false);
      fetchLoot();
    } catch (error) {
      console.error('Error updating loot:', error);
    }
  };

  const handleSplitSubmit = async () => {
    const token = localStorage.getItem('token');
    try {
      const splits = Array.from({ length: splitData.quantity }, (_, i) => ({
        ...loot.find(item => item.id === selectedItems[0]),
        quantity: 1
      }));
      await axios.post(`http://192.168.0.64:5000/api/loot/split`, { splits }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOpenSplitDialog(false);
      fetchLoot();
    } catch (error) {
      console.error('Error splitting stack:', error);
    }
  };

  const handleUpdateDialogClose = () => {
    setOpenUpdateDialog(false);
  };

  const filteredLoot = Array.isArray(loot) ? loot.filter(item => {
    return (
      (typeFilter ? item.type === typeFilter : true) &&
      (sizeFilter ? item.size === sizeFilter : true)
    );
  }) : [];

  const selectedItem = loot.find(item => item.id === selectedItems[0]);

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Kept - Party</Typography>
      </Paper>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              name="type"
              value={typeFilter}
              onChange={handleFilterChange}
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
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Size</InputLabel>
            <Select
              name="size"
              value={sizeFilter}
              onChange={handleFilterChange}
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
      </Grid>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Select</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Believed Value</TableCell>
              <TableCell>Average Appraisal</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredLoot.map((item) => (
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
                <TableCell>{item.size}</TableCell>
                <TableCell>{item.believedvalue || ''}</TableCell>
                <TableCell>{item.average_appraisal || ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }}>
        Sell
      </Button>
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }}>
        Trash
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }}>
        Keep Self
      </Button>
      {selectedItems.length === 1 && (
        <>
          <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={handleOpenUpdateDialog}>
            Update
          </Button>
          {selectedItem && selectedItem.quantity > 1 && (
            <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={handleOpenSplitDialog}>
              Split Stack
            </Button>
          )}
        </>
      )}
      {/* Update Dialog */}
      <Dialog open={openUpdateDialog} onClose={handleUpdateDialogClose}>
        <DialogTitle>Update Entry</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Quantity"
                type="number"
                name="quantity"
                value={updatedEntry.quantity || ''}
                onChange={handleUpdateChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Item Name"
                name="name"
                value={updatedEntry.name || ''}
                onChange={handleUpdateChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Magical?</InputLabel>
                <Select
                  name="unidentified"
                  value={updatedEntry.unidentified === null ? '' : updatedEntry.unidentified}
                  onChange={handleUpdateChange}
                >
                  <MenuItem value={null}>Not Magical</MenuItem>
                  <MenuItem value={false}>Identified</MenuItem>
                  <MenuItem value={true}>Unidentified</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Masterwork</InputLabel>
                <Select
                  name="masterwork"
                  value={updatedEntry.masterwork === null ? '' : updatedEntry.masterwork}
                  onChange={handleUpdateChange}
                >
                  <MenuItem value={true}>Yes</MenuItem>
                  <MenuItem value={false}>No</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  name="type"
                  value={updatedEntry.type || ''}
                  onChange={handleUpdateChange}
                >
                  <MenuItem value="Weapon">Weapon</MenuItem>
                  <MenuItem value="Armor">Armor</MenuItem>
                  <MenuItem value="Magic">Magic</MenuItem>
                  <MenuItem value="Gear">Gear</MenuItem>
                  <MenuItem value="Trade Good">Trade Good</MenuItem>
                  <MenuItem value="Other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Size</InputLabel>
                <Select
                  name="size"
                  value={updatedEntry.size || ''}
                  onChange={handleUpdateChange}
                >
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
            <Grid item xs={12}>
              <TextField
                label="Notes"
                name="notes"
                value={updatedEntry.notes || ''}
                onChange={handleUpdateChange}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleUpdateDialogClose}>Cancel</Button>
          <Button onClick={handleUpdateSubmit}>Update</Button>
        </DialogActions>
      </Dialog>
      {/* Split Dialog */}
      <Dialog open={openSplitDialog} onClose={() => setOpenSplitDialog(false)}>
        <DialogTitle>Split Stack</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Split the quantity of the selected item.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Quantity"
            type="number"
            fullWidth
            value={splitData.quantity}
            onChange={(e) => setSplitData({ ...splitData, quantity: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenSplitDialog(false)} color="primary">
            Cancel
          </Button>
          <Button onClick={handleSplitSubmit} color="primary">
            Split
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default KeptParty;
