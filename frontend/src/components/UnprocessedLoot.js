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
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TableSortLabel,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import {
  fetchActiveUser,
  handleSelectItem,
  updateLootStatus,
  handleSell,
  handleTrash,
  handleKeepSelf,
  handleKeepParty,
  handleSplitStack,
  handleUpdate,
  handleSplitChange,
  handleAddSplit,
  handleSplitSubmit,
  handleOpenUpdateDialog,
  handleOpenSplitDialog,
  handleUpdateDialogClose,
  handleSplitDialogClose,
  formatDate,
} from '../utils/utils';
import CustomSplitStackDialog from './dialogs/CustomSplitStackDialog';
import CustomUpdateDialog from './dialogs/CustomUpdateDialog';

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [openItems, setOpenItems] = useState({});
  const [error, setError] = useState(null);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [splitQuantities, setSplitQuantities] = useState([0, 0]);
  const [updatedEntry, setUpdatedEntry] = useState({});
  const [activeUser, setActiveUser] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState({ unidentified: '', type: '', size: '', pendingSale: '' });
  const [keepSelfDialogOpen, setKeepSelfDialogOpen] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState(null);

  useEffect(() => {
    fetchLoot();
    fetchActiveUser(setActiveUser);
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

  const handleKeepSelf = () => {
    if (selectedItems.length !== 1) return;
    const selectedItem = loot.individual.find((item) => item.id === selectedItems[0]);
    setSelectedCharacter(activeUser.activeCharacterId); // Assuming activeCharacterId is stored in activeUser
    setKeepSelfDialogOpen(true);
  };

  const handleConfirmKeepSelf = async () => {
    try {
      const token = localStorage.getItem('token');
      const selectedId = selectedItems[0]; // Only handle one selected item at a time
      const whohas = activeUser.activeCharacterId; // This should be the ID of the active character
      const data = { status: 'Kept Self', userId: activeUser.id, whohas };
      await axios.put(`http://192.168.0.64:5000/api/loot/${selectedId}`, data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedItems([]);
      setKeepSelfDialogOpen(false);
      fetchLoot();
    } catch (error) {
      console.error(`Error updating loot status to Kept Self:`, error);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prevFilters) => ({
      ...prevFilters,
      [name]: value,
    }));
  };

  const getIndividualItems = (name) => {
    return loot.individual.filter((item) => item.name === name);
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

  const filteredLoot = sortedLoot.filter((item) => {
    return (
      (filters.unidentified === '' || String(item.unidentified) === filters.unidentified) &&
      (filters.type === '' || item.type === filters.type) &&
      (filters.size === '' || item.size === filters.size) &&
      (filters.pendingSale === '' || (item.status === 'Pending Sale') === (filters.pendingSale === 'true'))
    );
  });

  const handleToggleOpen = (name) => {
    setOpenItems((prevOpenItems) => ({
      ...prevOpenItems,
      [name]: !prevOpenItems[name],
    }));
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

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
              <TableCell>
                <TableSortLabel
                  active={sortConfig.key === 'session_date'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('session_date')}
                >
                  Session Date
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
                        onChange={() => individualItems.forEach((item) => handleSelectItem(item.id, selectedItems, setSelectedItems))}
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
                    <TableCell>
                      {item.session_date ? formatDate(item.session_date) : ''}
                    </TableCell>
                  </TableRow>
                  {individualItems.length > 1 && (
                    <TableRow>
                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={10}>
                        <Collapse in={openItems[item.name]} timeout="auto" unmountOnExit>
                          <Table size="small">
                            <TableBody>
                              {individualItems.map((subItem) => (
                                <TableRow key={subItem.id}>
                                  <TableCell>
                                    <Checkbox
                                      checked={selectedItems.includes(subItem.id)}
                                      onChange={() => handleSelectItem(subItem.id, selectedItems, setSelectedItems)}
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
                                  <TableCell>
                                    {subItem.session_date ? formatDate(subItem.session_date) : ''}
                                  </TableCell>
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
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleSell(selectedItems, fetchLoot)}>
        Sell
      </Button>
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }} onClick={() => handleTrash(selectedItems, fetchLoot)}>
        Trash
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={handleKeepSelf}>
        Keep Self
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={() => handleKeepParty(selectedItems, fetchLoot)}>
        Keep Party
      </Button>
      {selectedItems.length === 1 && loot.individual.find(item => item.id === selectedItems[0] && item.quantity > 1) && (
        <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }} onClick={() => handleOpenSplitDialog(loot.individual, selectedItems, setSplitQuantities, setSplitDialogOpen)}>
          Split Stack
        </Button>
      )}
      {selectedItems.length === 1 && (
        <Button variant="contained" color="primary" sx={{ mt: 2 }} onClick={() => handleOpenUpdateDialog(loot.individual, selectedItems, setUpdatedEntry, setUpdateDialogOpen)}>
          Update
        </Button>
      )}

      <CustomSplitStackDialog
        open={splitDialogOpen}
        onClose={() => handleSplitDialogClose(setSplitDialogOpen)}
        splitQuantities={splitQuantities}
        onSplitChange={(index, value) => handleSplitChange(index, value, splitQuantities, setSplitQuantities)}
        onAddSplit={() => handleAddSplit(splitQuantities, setSplitQuantities, selectedItems, loot.individual)}
        onSplitSubmit={() => handleSplitSubmit(selectedItems, splitQuantities, activeUser, fetchLoot)}
      />

      <CustomUpdateDialog
        open={updateDialogOpen}
        onClose={() => handleUpdateDialogClose(setUpdateDialogOpen)}
        updatedEntry={updatedEntry}
        onUpdateChange={(e) => setUpdatedEntry({ ...updatedEntry, [e.target.name]: e.target.value })}
        onUpdateSubmit={() => handleUpdate(selectedItems, updatedEntry, fetchLoot)}
      />

      <Dialog open={keepSelfDialogOpen} onClose={() => setKeepSelfDialogOpen(false)}>
        <DialogTitle>Confirm Keep Self</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to keep this item? The item will be assigned to your character:
          </DialogContentText>
          <Typography variant="body1">
            Character: {activeUser?.characterName || 'No active character'} (ID: {activeUser?.activeCharacterId || 'No ID'})
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKeepSelfDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmKeepSelf} color="primary">Confirm</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default UnprocessedLoot;
