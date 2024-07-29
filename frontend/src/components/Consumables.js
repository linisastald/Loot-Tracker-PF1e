// src/components/Consumables.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Collapse,
  IconButton,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';

const API_URL = process.env.REACT_APP_API_URL;

const Consumables = () => {
  const [wands, setWands] = useState([]);
  const [potions, setPotions] = useState([]);
  const [scrolls, setScrolls] = useState([]);
  const [openChargesDialog, setOpenChargesDialog] = useState(false);
  const [selectedWand, setSelectedWand] = useState(null);
  const [newCharges, setNewCharges] = useState('');
  const [openSections, setOpenSections] = useState({ wands: true, potions: true, scrolls: true });

  useEffect(() => {
    fetchConsumables();
  }, []);

  const fetchConsumables = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/consumables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWands(response.data.wands);
      setPotions(response.data.potions);
      setScrolls(response.data.scrolls);
      console.log(response.data)
    } catch (error) {
      console.error('Error fetching consumables:', error);
    }
  };

  const handleUseConsumable = async (id, type) => {
    try {
      console.log('Using consumable:', id, type);
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/consumables/use`, {id, type}, {
        headers: {Authorization: `Bearer ${token}`},
      });
      fetchConsumables();
    } catch (error) {
      console.error('Error using consumable:', error);
    }
  };

  const handleOpenChargesDialog = (wand) => {
    setSelectedWand(wand);
    setOpenChargesDialog(true);
  };

  const handleCloseChargesDialog = () => {
    setOpenChargesDialog(false);
    setSelectedWand(null);
    setNewCharges('');
  };

  const handleUpdateCharges = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/consumables/wandcharges`, {
        id: selectedWand.id,
        charges: parseInt(newCharges),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      handleCloseChargesDialog();
      fetchConsumables();
    } catch (error) {
      console.error('Error updating wand charges:', error);
    }
  };

  const toggleSection = (section) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Consumables</Typography>
      </Paper>

      {/* Wands Section */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" onClick={() => toggleSection('wands')} style={{ cursor: 'pointer' }}>
          Wands
          <IconButton>
            {openSections.wands ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
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
                {wands.map((wand) => (
                    <TableRow key={wand.id}>
                      <TableCell>{wand.quantity}</TableCell>
                      <TableCell>{wand.name}</TableCell>
                      <TableCell>
                        {wand.charges !== null ? wand.charges : (
                            <Button onClick={() => handleOpenChargesDialog(wand)}>Enter Charges</Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button onClick={() => handleUseConsumable(wand.id, 'wand')} variant="contained" color="primary">
                          Use
                        </Button>
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
      </Paper>

      {/* Potions Section */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" onClick={() => toggleSection('potions')} style={{ cursor: 'pointer' }}>
          Potions
          <IconButton>
            {openSections.potions ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
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
                {potions.map((potion) => (
                    <TableRow key={potion.id}>
                      <TableCell>{potion.quantity}</TableCell>
                      <TableCell>{potion.name}</TableCell>
                      <TableCell>
                        <Button onClick={() => handleUseConsumable(potion.id, 'potion')} variant="contained" color="primary">
                          Use
                        </Button>
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
      </Paper>

      {/* Scrolls Section */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" onClick={() => toggleSection('scrolls')} style={{ cursor: 'pointer' }}>
          Scrolls
          <IconButton>
            {openSections.scrolls ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
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
                {scrolls.map((scroll) => (
                    <TableRow key={scroll.id}>
                      <TableCell>{scroll.quantity}</TableCell>
                      <TableCell>{scroll.name}</TableCell>
                      <TableCell>
                        <Button onClick={() => handleUseConsumable(scroll.id, 'scroll')} variant="contained" color="primary">
                          Use
                        </Button>
                      </TableCell>
                    </TableRow>
                ))}
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
            inputProps={{ min: 1, max: 50 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseChargesDialog}>Cancel</Button>
          <Button onClick={handleUpdateCharges}>Update</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Consumables;