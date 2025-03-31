// src/components/Consumables.js
import React, {useEffect, useState} from 'react';
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
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {KeyboardArrowDown, KeyboardArrowUp} from '@mui/icons-material';

const Consumables = () => {
    const [wands, setWands] = useState([]);
    const [potions, setPotions] = useState([]);
    const [scrolls, setScrolls] = useState([]);
    const [openChargesDialog, setOpenChargesDialog] = useState(false);
    const [selectedWand, setSelectedWand] = useState(null);
    const [newCharges, setNewCharges] = useState('');
    const [openSections, setOpenSections] = useState({wands: true, potions: true, scrolls: true});

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
            const response = await api.post(`/consumables/use`, {itemid, type});
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

    return (
        <Container maxWidth={false} component="main">
            <Paper sx={{p: 2, mb: 2}}>
                <Typography variant="h6">Consumables</Typography>
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
                                {wands.map((wand) => (
                                    <TableRow key={wand.id}>
                                        <TableCell>{wand.quantity}</TableCell>
                                        <TableCell>{wand.name}</TableCell>
                                        <TableCell>
                                            {wand.charges !== null ? wand.charges : (
                                                <Button onClick={() => handleOpenChargesDialog(wand)}>Enter
                                                    Charges</Button>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Button onClick={() => handleUseConsumable(wand.id, wand.name)}
                                                    variant="outlined" color="primary">
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
                                {potions.map((potion) => (
                                    <TableRow key={potion.itemid}>
                                        <TableCell>{potion.quantity}</TableCell>
                                        <TableCell>{potion.name}</TableCell>
                                        <TableCell>
                                            <Button onClick={() => handleUseConsumable(potion.itemid, potion.name)}
                                                    variant="outlined" color="primary">
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
                                {scrolls.map((scroll) => (
                                    <TableRow key={scroll.itemid}>
                                        <TableCell>{scroll.quantity}</TableCell>
                                        <TableCell>{scroll.name}</TableCell>
                                        <TableCell>
                                            <Button onClick={() => handleUseConsumable(scroll.itemid, scroll.name)}
                                                    variant="outlined" color="primary">
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
                        inputProps={{min: 1, max: 50}}
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