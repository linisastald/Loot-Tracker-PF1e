import React, {useEffect, useState} from 'react';
import api from '../../../utils/api';
import {
  Collapse,
  Container,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {KeyboardArrowDown, KeyboardArrowUp} from '@mui/icons-material';
import { formatDateOnly } from '../../../utils/dateOnly';

interface SoldSummaryRow {
    soldon: string;
    number_of_items: number | string;
    total: number | string;
}

interface SoldDetailRow {
    id?: number;
    session_date: string;
    quantity: number;
    name: string;
    soldfor: number | string;
}

// The sold endpoints answer { records } / { items } in the response body
// (or a bare array); normalize once.
const toRows = <T,>(payload: unknown, key: string): T[] => {
    if (Array.isArray(payload)) return payload as T[];
    const nested = (payload as Record<string, unknown> | null | undefined)?.[key];
    return Array.isArray(nested) ? (nested as T[]) : [];
};

const SoldLoot = () => {
    const [soldSummary, setSoldSummary] = useState<SoldSummaryRow[]>([]);
    const [soldDetails, setSoldDetails] = useState<Record<string, SoldDetailRow[]>>({});
    const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const fetchSoldSummary = async () => {
            try {
                const response = await api.get('/sold');
                setSoldSummary(toRows<SoldSummaryRow>(response.data, 'records'));
            } catch {
                setSoldSummary([]);
            }
        };

        fetchSoldSummary();
    }, []);

    const fetchSoldDetails = async (date: string) => {
        // The summary endpoint returns `soldon` as an ISO string at UTC
        // midnight (e.g. "2026-04-25T00:00:00.000Z"). The detail endpoint
        // expects YYYY-MM-DD matching the date the row was stored under,
        // not the viewer's local date. Slicing the ISO string keeps us
        // on the stored UTC date regardless of timezone.
        const formattedDate = typeof date === 'string' && date.length >= 10
            ? date.slice(0, 10)
            : new Date(date).toISOString().slice(0, 10);

        let rows: SoldDetailRow[] = [];
        try {
            const response = await api.get(`/sold/${formattedDate}`);
            rows = toRows<SoldDetailRow>(response.data, 'items');
        } catch {
            rows = [];
        }
        setSoldDetails((prevDetails) => ({...prevDetails, [date]: rows}));
    };

    const handleToggleOpen = (date: string) => {
        setOpenItems((prevOpenItems) => ({
            ...prevOpenItems,
            [date]: !prevOpenItems[date],
        }));

        if (!soldDetails[date]) {
            fetchSoldDetails(date);
        }
    };

    const totalSold = soldSummary.reduce((total, item) => total + parseFloat(String(item.total || 0)), 0);

    return (
        <Container component="main" sx={{maxWidth: 'none', overflowX: 'auto'}}>
            <Paper sx={{p: 2, mb: 2}}>
                <Typography variant="subtitle1">Total Sold: {totalSold.toFixed(2)} GP</Typography>
            </Paper>

            {soldSummary.length === 0 ? (
                <Paper sx={{p: 2}}>
                    <Typography>No sold items found</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{maxWidth: '100vw', overflowX: 'auto'}}>
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
                                        <TableCell>
                                            {formatDateOnly(item.soldon)}
                                        </TableCell>
                                        <TableCell>{item.number_of_items}</TableCell>
                                        <TableCell>{item.total}</TableCell>
                                        <TableCell>
                                            <IconButton
                                                aria-label="expand row"
                                                size="small"
                                                onClick={() => handleToggleOpen(item.soldon)}
                                            >
                                                {openItems[item.soldon] ? <KeyboardArrowUp/> : <KeyboardArrowDown/>}
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell style={{paddingBottom: 0, paddingTop: 0}} colSpan={4}>
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
                                                            <TableRow
                                                                key={`detail-${detail.id || `${item.soldon}-${detailIndex}`}`}>
                                                                <TableCell>
                                                                    {formatDateOnly(detail.session_date)}
                                                                </TableCell>
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