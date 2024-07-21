import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Paper,
  Typography,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Collapse,
} from '@mui/material';
import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';
import { formatDate } from '../utils/utils'; // Adjust the path as necessary

const API_URL = process.env.REACT_APP_API_URL;

const SoldLoot = () => {
  const [soldSummary, setSoldSummary] = useState([]);
  const [soldDetails, setSoldDetails] = useState({});
  const [openItems, setOpenItems] = useState({});

  useEffect(() => {
    const fetchSoldSummary = async () => {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/sold`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSoldSummary(response.data);
    };

    fetchSoldSummary();
  }, []);

  const handleToggleOpen = (date) => {
    setOpenItems((prevOpenItems) => ({
      ...prevOpenItems,
      [date]: !prevOpenItems[date],
    }));

    if (!soldDetails[date]) {
      const fetchSoldDetails = async () => {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/sold/${date}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSoldDetails((prevDetails) => ({
          ...prevDetails,
          [date]: response.data,
        }));
      };

      fetchSoldDetails();
    }
  };

  const totalSold = soldSummary.reduce((total, item) => total + parseFloat(item.total), 0);

  return (
    <Container component="main" sx={{ maxWidth: '100vw', overflowX: 'auto' }}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Sold Loot</Typography>
        <Typography variant="subtitle1">Total Sold: {totalSold.toFixed(2)}</Typography>
      </Paper>
      <TableContainer component={Paper} sx={{ maxWidth: '100vw', overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Number of Items</TableCell>
              <TableCell>Total</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {soldSummary.map((item) => (
              <React.Fragment key={item.soldon}>
                <TableRow key={`summary-${item.soldon}`}>
                  <TableCell>{formatDate(item.soldon)}</TableCell>
                  <TableCell>{item.number_of_items}</TableCell>
                  <TableCell>{item.total}</TableCell>
                  <TableCell>
                    <IconButton
                      aria-label="expand row"
                      size="small"
                      onClick={() => handleToggleOpen(item.soldon)}
                    >
                      {openItems[item.soldon] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                  </TableCell>
                </TableRow>
                <TableRow key={`details-${item.soldon}`}>
                  <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={4}>
                    <Collapse in={openItems[item.soldon]} timeout="auto" unmountOnExit>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Session Date</TableCell>
                            <TableCell>Quantity</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>Sold For</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {soldDetails[item.soldon]?.map((detail) => (
                            <TableRow key={`detail-${detail.id}`}>
                              <TableCell>{formatDate(detail.session_date)}</TableCell>
                              <TableCell>{detail.quantity}</TableCell>
                              <TableCell>{detail.name}</TableCell>
                              <TableCell>{detail.soldfor}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
};

export default SoldLoot;
