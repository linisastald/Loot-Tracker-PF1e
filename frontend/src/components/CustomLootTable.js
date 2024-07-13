import React from 'react';
import { TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Paper, Checkbox, IconButton, Collapse, TableSortLabel, Tooltip } from '@mui/material';
import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';
import { formatDate } from '../utils/utils'; // Adjust the path as necessary
import { styled } from '@mui/system';

const SubItemTableRow = styled(TableRow)(({ theme }) => ({
  backgroundColor: theme.palette.action.hover,
}));

const CustomLootTable = ({ loot, individualLoot, selectedItems, setSelectedItems, openItems, setOpenItems, handleSelectItem, handleSort, sortConfig }) => {
  const handleToggleOpen = (name) => {
    setOpenItems((prevOpenItems) => ({
      ...prevOpenItems,
      [name]: !prevOpenItems[name],
    }));
  };

  const getIndividualItems = (name) => {
    return individualLoot.filter((item) => item.name === name);
  };

  const cellStyle = { padding: '8px' }; // Adjust padding as needed

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell style={cellStyle}>Select</TableCell>
            <TableCell style={cellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'quantity'}
                direction={sortConfig.direction}
                onClick={() => handleSort('quantity')}
              >
                Quantity
              </TableSortLabel>
            </TableCell>
            <TableCell style={cellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'name'}
                direction={sortConfig.direction}
                onClick={() => handleSort('name')}
              >
                Name
              </TableSortLabel>
            </TableCell>
            <TableCell style={cellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'unidentified'}
                direction={sortConfig.direction}
                onClick={() => handleSort('unidentified')}
              >
                Unidentified
              </TableSortLabel>
            </TableCell>
            <TableCell style={cellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'type'}
                direction={sortConfig.direction}
                onClick={() => handleSort('type')}
              >
                Type
              </TableSortLabel>
            </TableCell>
            <TableCell style={cellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'size'}
                direction={sortConfig.direction}
                onClick={() => handleSort('size')}
              >
                Size
              </TableSortLabel>
            </TableCell>
            <TableCell style={cellStyle}>Believed Value</TableCell>
            <TableCell style={cellStyle}>Average Appraisal</TableCell>
            <TableCell style={cellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'status'}
                direction={sortConfig.direction}
                onClick={() => handleSort('status')}
              >
                Pending Sale
              </TableSortLabel>
            </TableCell>
            <TableCell style={cellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'session_date'}
                direction={sortConfig.direction}
                onClick={() => handleSort('session_date')}
              >
                Session Date
              </TableSortLabel>
            </TableCell>
            <TableCell style={cellStyle}>Last Update</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loot.map((item) => {
            const individualItems = getIndividualItems(item.name);
            const totalQuantity = individualItems.reduce((sum, item) => sum + item.quantity, 0);
            const isPendingSale = individualItems.some((item) => item.status === 'Pending Sale');

            return (
              <React.Fragment key={`${item.name}-${item.unidentified}-${item.type}-${item.size}`}>
                <TableRow>
                  <TableCell style={cellStyle}>
                    <Checkbox
                      checked={individualItems.every((item) => selectedItems.includes(item.id))}
                      indeterminate={
                        individualItems.some((item) => selectedItems.includes(item.id)) &&
                        !individualItems.every((item) => selectedItems.includes(item.id))
                      }
                      onChange={() => individualItems.forEach((item) => handleSelectItem(item.id, setSelectedItems))}
                    />
                  </TableCell>
                  <TableCell style={cellStyle}>{totalQuantity}</TableCell>
                  <TableCell style={cellStyle}>
                    {individualItems.length > 1 && (
                      <IconButton
                        aria-label="expand row"
                        size="small"
                        onClick={() => handleToggleOpen(item.name)}
                      >
                        {openItems[item.name] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                      </IconButton>
                    )}
                    <Tooltip title={item.notes || 'No notes'} arrow>
                      <span>{item.name}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell style={cellStyle}>
                    {item.unidentified === null
                      ? ''
                      : item.unidentified
                      ? <strong>Unidentified</strong>
                      : 'Identified'}
                  </TableCell>
                  <TableCell style={cellStyle}>{item.type}</TableCell>
                  <TableCell style={cellStyle}>{item.size}</TableCell>
                  <TableCell style={cellStyle}>{item.believedvalue || ''}</TableCell>
                  <TableCell style={cellStyle}>{item.average_appraisal || ''}</TableCell>
                  <TableCell style={cellStyle}>{isPendingSale ? '✔' : ''}</TableCell>
                  <TableCell style={cellStyle}>{item.session_date ? formatDate(item.session_date) : ''}</TableCell>
                  <TableCell style={cellStyle}>{item.lastupdate ? formatDate(item.lastupdate) : ''}</TableCell>
                </TableRow>
                {individualItems.length > 1 && (
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={11}>
                      <Collapse in={openItems[item.name]} timeout="auto" unmountOnExit>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell style={cellStyle}>Select</TableCell>
                              <TableCell style={cellStyle}>Quantity</TableCell>
                              <TableCell style={cellStyle}>Size</TableCell>
                              <TableCell style={cellStyle}>Pending Sale</TableCell>
                              <TableCell style={cellStyle}>Session Date</TableCell>
                              <TableCell style={cellStyle}>Last Update</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {individualItems.map((subItem) => (
                              <SubItemTableRow key={subItem.id}>
                                <TableCell style={cellStyle}>
                                  <Checkbox
                                    checked={selectedItems.includes(subItem.id)}
                                    onChange={() => handleSelectItem(subItem.id, setSelectedItems)}
                                  />
                                </TableCell>
                                <TableCell style={cellStyle}>{subItem.quantity}</TableCell>
                                <TableCell style={cellStyle}>{subItem.size}</TableCell>
                                <TableCell style={cellStyle}>{subItem.status === 'Pending Sale' ? '✔' : ''}</TableCell>
                                <TableCell style={cellStyle}>{subItem.session_date ? formatDate(subItem.session_date) : ''}</TableCell>
                                <TableCell style={cellStyle}>{subItem.lastupdate ? formatDate(subItem.lastupdate) : ''}</TableCell>
                              </SubItemTableRow>
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
  );
};

export default CustomLootTable;
