// src/components/Consumables.js
import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import {
  Button,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  InputAdornment,
  Box,
  Tooltip
} from '@mui/material';
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  Search as SearchIcon,
  BatteryFull as BatteryFullIcon,
  BatteryAlert as BatteryAlertIcon
} from '@mui/icons-material';

const Consumables = () => {
  const [wands, setWands] = useState([]);
  const [potions, setPotions] = useState([]);
  const [scrolls, setScrolls] = useState([]);
  const [openChargesDialog, setOpenChargesDialog] = useState(false);
  const [selectedWand, setSelectedWand] = useState(null);
  const [newCharges, setNewCharges] = useState('');
  const [openSections, setOpenSections] = useState({wands: true, potions: true, scrolls: true});
  const [searchQuery, setSearchQuery] = useState('');

  // Maximum charges for wands
  const MAX_WAND_CHARGES = 50;

  useEffect(() => {
    fetchConsumables();
  }, []);

  const fetchConsumables = async () => {
    try {
      const response = await api.get(`/consumables`);
      setWands(response.data.wands);

      // Separate potions and scrolls based on their names
      const potions = response.data.potionsScrolls.filter(item => item.name.toLowerCase().includes('potion of'));
      const scrolls = response.data.potionsScrolls.filter(item => item.name.toLowerCase().includes('scroll of'));

      setPotions(potions);
      setScrolls(scrolls);
    } catch (error) {
      console.error('Error fetching consumables:', error);
    }
  };

  const handleUseConsumable = async (itemid, name) => {
    try {
      const type = name.toLowerCase().includes('potion of') ? 'potion' :
        name.toLowerCase().includes('scroll of') ? 'scroll' : 'wand';
      await api.post(`/consumables/use`, {itemid, type});
      // Add a small delay to ensure server processes the update before fetching
      setTimeout(() => {
        fetchConsumables();
      }, 300);
    } catch (error) {
      console.error('Error using consumable:', error);
    }
  };

  const handleOpenChargesDialog = (wand) => {
    setSelectedWand(wand);
    setNewCharges(wand.charges || '');
    setOpenChargesDialog(true);
  };

  const handleCloseChargesDialog = () => {
    setOpenChargesDialog(false);
    setSelectedWand(null);
    setNewCharges('');
  };

  const handleUpdateCharges = async () => {
    try {
      await api.put(`/consumables/wandcharges`, {
        id: selectedWand.id,
        charges: parseInt(newCharges),
      });
      handleCloseChargesDialog();
      fetchConsumables();
    } catch (error) {
      console.error('Error updating wand charges:', error);
    }
  };

  const toggleSection = (section) => {
    setOpenSections(prev => ({...prev, [section]: !prev[section]}));
  };

  // Filter consumables based on search query
  const filterItems = (items) => {
    if (!searchQuery) return items;
    return items.filter(item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  // Calculate progress color based on charges percentage
  const getChargeProgressColor = (charges) => {
    if (!charges) return 'error';
    const percentage = (charges / MAX_WAND_CHARGES) * 100;
    if (percentage > 75) return 'success';
    if (percentage > 25) return 'warning';
    return 'error';
  };

  // Render charge progress bar
  const renderChargeProgress = (charges) => {
    if (charges === null || charges === undefined) return null;

    const percentage = (charges / MAX_WAND_CHARGES) * 100;
    const color = getChargeProgressColor(charges);

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <Box sx={{ width: '100%', mr: 1 }}>
          <LinearProgress
            variant="determinate"
            value={percentage}
            color={color}
            sx={{ height: 10, borderRadius: 5 }}
          />
        </Box>
        <Box sx={{ minWidth: 35 }}>
          <Typography variant="body2" color="text.secondary">
            {charges}/{MAX_WAND_CHARGES}
          </Typography>
        </Box>
      </Box>
    );
  };

  // Filter consumables based on search query
  const filteredWands = filterItems(wands);
  const filteredPotions = filterItems(potions);
  const filteredScrolls = filterItems(scrolls);

  return (
    <Container maxWidth={false} component="main">
      <Paper sx={{p: 2, mb: 2}}>
        {/* Search Bar */}
        <TextField
          fullWidth
          margin="normal"
          variant="outlined"
          placeholder="Search consumables..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />
      </Paper>

      {/* Wands Section */}
      <Paper sx={{p: 2, mb: 2}}>
        <Typography variant="h6" onClick={() => toggleSection('wands')} style={{cursor: 'pointer'}}>
          Wands
          <IconButton>
            {openSections.wands ? <KeyboardArrowUp/> : <KeyboardArrowDown/>}
          </IconButton>
        </Typography>
        <Collapse in={openSections.wands}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Quantity</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Charges</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredWands.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      {searchQuery ? "No matching wands found" : "No wands available"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredWands.map((wand) => (
                    <TableRow key={wand.id}>
                      <TableCell>{wand.quantity}</TableCell>
                      <TableCell>{wand.name}</TableCell>
                      <TableCell sx={{ width: '30%' }}>
                        {wand.charges !== null ? (
                          <Tooltip title={`${wand.charges} out of ${MAX_WAND_CHARGES} charges remaining`}>
                            <Box>
                              {renderChargeProgress(wand.charges)}
                            </Box>
                          </Tooltip>
                        ) : (
                          <Button onClick={() => handleOpenChargesDialog(wand)}>
                            Enter Charges
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => handleUseConsumable(wand.id, wand.name)}
                          variant="outlined"
                          color="primary"
                          disabled={!wand.charges || wand.charges < 1}
                        >
                          Use
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
      </Paper>

      {/* Potions Section */}
      <Paper sx={{p: 2, mb: 2}}>
        <Typography variant="h6" onClick={() => toggleSection('potions')} style={{cursor: 'pointer'}}>
          Potions
          <IconButton>
            {openSections.potions ? <KeyboardArrowUp/> : <KeyboardArrowDown/>}
          </IconButton>
        </Typography>
        <Collapse in={openSections.potions}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Quantity</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredPotions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      {searchQuery ? "No matching potions found" : "No potions available"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPotions.map((potion) => (
                    <TableRow key={potion.itemid}>
                      <TableCell>{potion.quantity}</TableCell>
                      <TableCell>{potion.name}</TableCell>
                      <TableCell>
                        <Button
                          onClick={() => handleUseConsumable(potion.itemid, potion.name)}
                          variant="outlined"
                          color="primary"
                          disabled={potion.quantity < 1}
                        >
                          Use
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
      </Paper>

      {/* Scrolls Section */}
      <Paper sx={{p: 2, mb: 2}}>
        <Typography variant="h6" onClick={() => toggleSection('scrolls')} style={{cursor: 'pointer'}}>
          Scrolls
          <IconButton>
            {openSections.scrolls ? <KeyboardArrowUp/> : <KeyboardArrowDown/>}
          </IconButton>
        </Typography>
        <Collapse in={openSections.scrolls}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Quantity</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredScrolls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center">
                      {searchQuery ? "No matching scrolls found" : "No scrolls available"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredScrolls.map((scroll) => (
                    <TableRow key={scroll.itemid}>
                      <TableCell>{scroll.quantity}</TableCell>
                      <TableCell>{scroll.name}</TableCell>
                      <TableCell>
                        <Button
                          onClick={() => handleUseConsumable(scroll.itemid, scroll.name)}
                          variant="outlined"
                          color="primary"
                          disabled={scroll.quantity < 1}
                        >
                          Use
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
      </Paper>

      {/* Charges Dialog */}
      <Dialog open={openChargesDialog} onClose={handleCloseChargesDialog}>
        <DialogTitle>Enter Charges</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Charges"
            type="number"
            fullWidth
            value={newCharges}
            onChange={(e) => setNewCharges(e.target.value)}
            inputProps={{min: 1, max: MAX_WAND_CHARGES}}
            helperText={`Max ${MAX_WAND_CHARGES} charges`}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseChargesDialog}>Cancel</Button>
          <Button
            onClick={handleUpdateCharges}
            disabled={!newCharges || newCharges < 1 || newCharges > MAX_WAND_CHARGES}
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Consumables;