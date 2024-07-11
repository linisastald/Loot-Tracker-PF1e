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
  IconButton
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';

const UnprocessedLoot = () => {
  const [loot, setLoot] = useState({ summary: [], individual: [] });
  const [selectedItems, setSelectedItems] = useState([]);
  const [openItems, setOpenItems] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
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

    fetchLoot();
  }, []);

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

  return (
    <Container component="main">
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Unprocessed Loot</Typography>
        {error && <Typography color="error">{error}</Typography>}
      </Paper>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Select</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Unidentified</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Believed Value</TableCell>
              <TableCell>Average Appraisal</TableCell>
              <TableCell>Pending Sale</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loot.summary.map((item) => {
              const individualItems = getIndividualItems(item.name);
              const totalQuantity = individualItems.reduce((sum, item) => sum + item.quantity, 0);

              return (
                <React.Fragment key={item.name}>
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
                      <IconButton
                        aria-label="expand row"
                        size="small"
                        onClick={() => handleToggleOpen(item.name)}
                      >
                        {openItems[item.name] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                      </IconButton>
                      {item.name}
                    </TableCell>
                    <TableCell>{item.unidentified ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell>{item.believedvalue || ''}</TableCell>
                    <TableCell>{item.average_appraisal || ''}</TableCell>
                    <TableCell>{item.status === 'Pending Sale' ? '✔' : ''}</TableCell>
                  </TableRow>
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
                                <TableCell>{subItem.unidentified ? 'Yes' : 'No'}</TableCell>
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
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }}>
        Sell
      </Button>
      <Button variant="contained" color="secondary" sx={{ mt: 2, mr: 1 }}>
        Trash
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2, mr: 1 }}>
        Keep Self
      </Button>
      <Button variant="contained" color="primary" sx={{ mt: 2 }}>
        Keep Party
      </Button>
    </Container>
  );
};

export default UnprocessedLoot;
