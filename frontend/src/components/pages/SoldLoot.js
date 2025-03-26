import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
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
import { formatDate } from '../../utils/utils';

const SoldLoot = () => {
  const [soldSummary, setSoldSummary] = useState([]);
  const [soldDetails, setSoldDetails] = useState({});
  const [openItems, setOpenItems] = useState({});

  useEffect(() => {
    const fetchSoldSummary = async () => {
      try {
        const response = await api.get(`/sold`);

        // Make sure we have an array of items
        if (response.data && Array.isArray(response.data)) {
          setSoldSummary(response.data);
        } else if (response.data && Array.isArray(response.data.records)) {
          // Handle if the API returns an object with a records array
          setSoldSummary(response.data.records);
        } else {
          console.error('Unexpected response format:', response.data);
          setSoldSummary([]);
        }
      } catch (error) {
        console.error('Error fetching sold data:', error);
        setSoldSummary([]);
      }
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
        try {
          // Convert the date string to a Date object and format it as YYYY-MM-DD
          const dateObj = new Date(date);
          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          const formattedDate = `${year}-${month}-${day}`;

          console.log(`Fetching details for date: ${formattedDate}`);
          const response = await api.get(`/sold/${formattedDate}`);

          // Handle different response formats
          if (response.data && Array.isArray(response.data)) {
            setSoldDetails((prevDetails) => ({
              ...prevDetails,
              [date]: response.data,
            }));
          } else if (response.data && Array.isArray(response.data.items)) {
            setSoldDetails((prevDetails) => ({
              ...prevDetails,
              [date]: response.data.items,
            }));
          } else {
            console.error('Unexpected detail response format:', response.data);
            setSoldDetails((prevDetails) => ({
              ...prevDetails,
              [date]: [],
            }));
          }
        } catch (error) {
          console.error('Error fetching sold details:', error);
          setSoldDetails((prevDetails) => ({
            ...prevDetails,
            [date]: [],
          }));
        }
      };

      fetchSoldDetails();
    }
  };

  // Safely calculate total with fallback to 0 if not an array
  const totalSold = Array.isArray(soldSummary)
    ? soldSummary.reduce((total, item) => total + parseFloat(item.total || 0), 0)
    : 0;

  return (
    <Container component="main" sx={{ maxWidth: 'none', overflowX: 'auto' }}>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Sold Loot</Typography>
        <Typography variant="subtitle1">Total Sold: {totalSold.toFixed(2)}</Typography>
      </Paper>

      {!Array.isArray(soldSummary) ? (
        <Paper sx={{ p: 2 }}>
          <Typography color="error">No sold items data available</Typography>
        </Paper>
      ) : soldSummary.length === 0 ? (
        <Paper sx={{ p: 2 }}>
          <Typography>No sold items found</Typography>
        </Paper>
      ) : (
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
              {soldSummary.map((item, index) => (
                <React.Fragment key={`summary-${item.soldon || index}`}>
                  <TableRow>
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
                  <TableRow>
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
                            {soldDetails[item.soldon]?.map((detail, detailIndex) => (
                              <TableRow key={`detail-${detail.id || `${item.soldon}-${detailIndex}`}`}>
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
      )}
    </Container>
  );
};

export default SoldLoot;