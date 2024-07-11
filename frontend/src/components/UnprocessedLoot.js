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
  Checkbox,
  Button,
  Typography,
  Collapse,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TableSortLabel,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import jwt_decode from 'jwt-decode';

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [openItems, setOpenItems] = useState({});
  const [error, setError] = useState(null);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [splitQuantities, setSplitQuantities] = useState([]);
  const [updatedEntry, setUpdatedEntry] = useState({});
  const [activeUser, setActiveUser] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState({ unidentified: '', type: '', size: '', pendingSale: '' });

  useEffect(() => {
    fetchLoot();
    fetchActiveUser();
  }, []);

  const fetchLoot = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://192.168.0.64:5000/api/loot', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLoot(response.data);
    } catch (error) {
      console.error('Error fetching loot:', error);
      setError('Failed to fetch loot data.');
    }
  };

  const fetchActiveUser = () => {
    const token = localStorage.getItem('token');
    if (token) {
      const decodedToken = jwt_decode(token);
      setActiveUser(decodedToken);
    }
  };

  const handleSelectItem = (id) => {
    setSelectedItems((prevSelectedItems) =>
      prevSelectedItems.includes(id)
        ? prevSelectedItems.filter((itemId) => itemId !== id)
        : [...prevSelectedItems, id]
    );
  };

  const handleToggleOpen = (name) => {
    setOpenItems((prevOpenItems) => ({
      ...prevOpenItems,
      [name]: !prevOpenItems[name],
    }));
  };

  const getIndividualItems = (name) => {
    return loot.individual.filter((item) => item.name === name);
  };

  const updateLootStatus = async (status) => {
    try {
      const token = localStorage.getItem('token');
      const selectedId = selectedItems[0]; // Only handle one selected item at a time
      const selectedItem = loot.individual.find((item) => item.id === selectedId);
      const whohas = status === 'Kept Self' ? activeUser.activeCharacterId : null;
      const data = status === 'Kept Self' ? { status, userId: activeUser.id, whohas } : { status, userId: activeUser.id };
      await axios.put(`http://192.168.0.64:5000/api/loot/${selectedId}`, data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedItems([]);
      fetchLoot();
    } catch (error) {
      console.error(`Error updating loot status to ${status}:`, error);
    }
  };

  const handleSell = () => updateLootStatus('Pending Sale');
  const handleTrash = () => updateLootStatus('Trashed');
  const handleKeepSelf = () => updateLootStatus('Kept Self');
  const handleKeepParty = () => updateLootStatus('Kept Party');

  const handleSplitStack = () => {
    if (selectedItems.length !== 1) return;
    const selectedItem = loot.individual.find((item) => item.id === selectedItems[0]);
    setSplitQuantities(new Array(selectedItem.quantity).fill(''));
    setSplitDialogOpen(true);
  };

  const handleUpdate = () => {
    if (selectedItems.length !== 1) return;
    const selectedItem = loot.individual.find((item) => item.id === selectedItems[0]);
    setUpdatedEntry({ ...selectedItem });
    setUpdateDialogOpen(true);
  };

  const handleSplitDialogClose = () => {
    setSplitDialogOpen(false);
  };

  const handleUpdateDialogClose = () => {
    setUpdateDialogOpen(false);
  };

  const handleSplitChange = (index, value) => {
    const updatedSplits = [...splitQuantities];
    updatedSplits[index] = value;
    setSplitQuantities(updatedSplits);
  };

  const handleUpdateChange = (e) => {
    const { name, value } = e.target;
    setUpdatedEntry((prevEntry) => ({
      ...prevEntry,
      [name]: value,
    }));
  };

  const handleSplitSubmit = async () => {
    try {
      const token = localStorage.getItem('token');
      const selectedId = selectedItems[0];
      const splits = splitQuantities.map((quantity) => ({
        quantity: parseInt(quantity, 10),
      }));
      await axios.post('http://192.168.0.64:5000/api/loot/split-stack', {
        id: selectedId,
        splits,
        userId: activeUser.id,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedItems([]);
      setSplitDialogOpen(false);
      fetchLoot();
    } catch (error) {
      console.error('Error splitting stack:', error);
    }
  };

  const handleUpdateSubmit = async () => {
    try {
      const token = localStorage.getItem('token');
      const filteredUpdatedEntry = Object.fromEntries(
        Object.entries(updatedEntry).filter(([key, value]) => value !== '' && value !== null)
      );
      await axios.put(`http://192.168.0.64:5000/api/loot/update-entry/${selectedItems[0]}`, {
        updatedEntry: filteredUpdatedEntry,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedItems([]);
      setUpdateDialogOpen(false);
      fetchLoot();
    } catch (error) {
      console.error('Error updating entry:', error);
    }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedLoot = [...loot.summary].sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prevFilters) => ({
      ...prevFilters,
      [name]: value,
    }));
  };

  const filteredLoot = sortedLoot.filter((item) => {
    return (
      (filters.unidentified === '' || String(item.unidentified) === filters.unidentified) &&
      (filters.type === '' || item.type === filters.type) &&
      (filters.size === '' || item.size === filters.size) &&
      (filters.pendingSale === '' || (item.status === 'Pending Sale') === (filters.pendingSale === 'true'))
    );
  });

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Unprocessed Loot</Typography>
        {error && <Typography color="error">{error}</Typography>}
      </Paper>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={3}>
          <FormControl fullWidth>
            <InputLabel>Unidentified</InputLabel>
            <Select
              name="unidentified"
              value={filters.unidentified}
              onChange={handleFilterChange}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Unidentified</MenuItem>
              <MenuItem value="false">Identified</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={3}>
          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              name="type"
              value={filters.type}
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
        <Grid item xs={3}>
          <FormControl fullWidth>
            <InputLabel>Size</InputLabel>
            <Select
              name="size"
              value={filters.size}
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
        <Grid item xs={3}>
          <FormControl fullWidth>
            <InputLabel>Pending Sale</InputLabel>
            <Select
              name="pendingSale"
              value={filters.pendingSale}
              onChange={handleFilterChange}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Pending Sale</MenuItem>
              <MenuItem value="false">Not Pending Sale</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Select</TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'quantity'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('quantity')}
                >
                  Quantity
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'name'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('name')}
                >
                  Name
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'unidentified'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('unidentified')}
                >
                  Unidentified
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'type'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('type')}
                >
                  Type
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'size'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('size')}
                >
                  Size
                </TableSortLabel>
              </TableCell>
              <TableCell>Believed Value</TableCell>
              <TableCell>Average Appraisal</TableCell>
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'status'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('status')}
                >
                  Pending Sale
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredLoot.map((item) => {
              const individualItems = getIndividualItems(item.name);
              const totalQuantity = individualItems.reduce((sum, item) => sum + item.quantity, 0);
              const isPendingSale = individualItems.some((item) => item.status === 'Pending Sale');

              return (
                <React.Fragment key={`${item.name}-${item.unidentified}-${item.type}-${item.size}`}>
                  <TableRow>
                    <TableCell>
                      <Checkbox
                        checked={individualItems.every((item) => selectedItems.includes(item.id))}
                        indeterminate={
                          individualItems.some((item) => selectedItems.includes(item.id)) &&
                          !individualItems.every((item) => selectedItems.includes(item.id))
                        }
                        onChange={() => individualItems.forEach((item) => handleSelectItem(item.id))}
                      />
                    </TableCell>
                    <TableCell>{totalQuantity}</TableCell>
                    <TableCell>
                      {individualItems.length > 1 && (
                        <IconButton
                          aria-label="expand row"
                          size="small"
                          onClick={() => handleToggleOpen(item.name)}
                        >
                          {openItems[item.name] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                        </IconButton>
                      )}
                      {item.name}
                    </TableCell>
                    <TableCell>
                      {item.unidentified === null
                        ? ''
                        : item.unidentified
                        ? <strong>Unidentified</strong>
                        : 'Identified'}
                    </TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell>{item.believedvalue || ''}</TableCell>
                    <TableCell>{item.average_appraisal || ''}</TableCell>
                    <TableCell>{isPendingSale ? '✔' : ''}</TableCell>
                  </TableRow>
                  {individualItems.length > 1 && (
                    <TableRow>
                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={9}>
                        <Collapse in={openItems[item.name]} timeout="auto" unmountOnExit>
                          <Table size="small">
                            <TableBody>
                              {individualItems.map((subItem) => (
                                <TableRow key={subItem.id}>
                                  <TableCell>
                                    <Checkbox
                                      checked={selectedItems.includes(subItem.id)}
                                      onChange={() => handleSelectItem(subItem.id)}
                                    />
                                  </TableCell>
                                  <TableCell>{subItem.quantity}</TableCell>
                                  <TableCell>{subItem.name}</TableCell>
                                  <TableCell>
                                    {subItem.unidentified === null
                                      ? ''
                                      : subItem.unidentified
                                      ? <strong>Unidentified</strong>
                                      : 'Identified'}
                                  </TableCell>
                                  <TableCell>{subItem.type}</TableCell>
                                  <TableCell>{subItem.size}</TableCell>
                                  <TableCell>{subItem.believedvalue || ''}</TableCell>
                                  <TableCell>{subItem.appraisalroll || ''}</TableCell>
                                  <TableCell>{subItem.status === 'Pending Sale' ? '✔' : ''}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={handleSell}>
        Sell
      </Button>
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }} onClick={handleTrash}>
        Trash
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={handleKeepSelf}>
        Keep Self
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={handleKeepParty}>
        Keep Party
      </Button>
      {selectedItems.length === 1 && loot.individual.find(item => item.id === selectedItems[0] && item.quantity > 1) && (
        <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={handleSplitStack}>
          Split Stack
        </Button>
      )}
      {selectedItems.length === 1 && (
        <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={handleUpdate}>
          Update
        </Button>
      )}

      {/* Split Stack Dialog */}
      <Dialog open={splitDialogOpen} onClose={handleSplitDialogClose}>
        <DialogTitle>Split Stack</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter the quantities for each new stack:
          </DialogContentText>
          {splitQuantities.map((quantity, index) => (
            <TextField
              key={index}
              autoFocus
              margin="dense"
              label={`Quantity ${index + 1}`}
              type="number"
              fullWidth
              value={quantity}
              onChange={(e) => handleSplitChange(index, e.target.value)}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSplitDialogClose}>Cancel</Button>
          <Button onClick={handleSplitSubmit}>Split</Button>
        </DialogActions>
      </Dialog>

      {/* Update Dialog */}
      <Dialog open={updateDialogOpen} onClose={handleUpdateDialogClose}>
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
    </Container>
  );
};

export default UnprocessedLoot;
