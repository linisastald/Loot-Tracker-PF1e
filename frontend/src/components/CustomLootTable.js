import React from 'react';
import { TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Paper, Checkbox, IconButton, Collapse, TableSortLabel, Tooltip } from '@mui/material';
import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';
import { formatDate } from '../utils/utils'; // Adjust the path as necessary
import { styled } from '@mui/system';

const SubItemTableRow = styled(TableRow)(({ theme }) => ({
  backgroundColor: theme.palette.action.hover,
  '& .MuiTableCell-root': {
    padding: '4px', // Adjust padding to make the rows thinner
  },
}));

const CustomLootTable = ({
  loot,
  individualLoot,
  selectedItems,
  setSelectedItems,
  openItems,
  setOpenItems,
  handleSelectItem,
  handleSort,
  sortConfig,
  showColumns = {
    select: true,
    unidentified: true,
    pendingSale: true,
    whoHasIt: true, // Ensure the whoHasIt column is included by default
  }
}) => {
  const handleToggleOpen = (name) => {
    setOpenItems((prevOpenItems) => ({
      ...prevOpenItems,
      [name]: !prevOpenItems[name],
    }));
  };

  const getIndividualItems = (name) => {
    return individualLoot.filter((item) => item.name === name);
  };

  const mainCellStyle = { padding: '16px' }; // Default padding for main rows
  const subCellStyle = { padding: '4px' }; // Smaller padding for sub-item rows

  return (
    <TableContainer component={Paper} sx={{ maxWidth: '100vw', overflowX: 'auto' }}>
      <Table>
        <TableHead>
          <TableRow>
            {showColumns.select && <TableCell style={mainCellStyle}>Select</TableCell>}
            <TableCell style={mainCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'quantity'}
                direction={sortConfig.direction}
                onClick={() => handleSort('quantity')}
              >
                Quantity
              </TableSortLabel>
            </TableCell>
            <TableCell style={mainCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'name'}
                direction={sortConfig.direction}
                onClick={() => handleSort('name')}
              >
                Name
              </TableSortLabel>
            </TableCell>
            {showColumns.unidentified && (
              <TableCell style={mainCellStyle}>
                <TableSortLabel
                  active={sortConfig.key === 'unidentified'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('unidentified')}
                >
                  Unidentified
                </TableSortLabel>
              </TableCell>
            )}
            <TableCell style={mainCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'type'}
                direction={sortConfig.direction}
                onClick={() => handleSort('type')}
              >
                Type
              </TableSortLabel>
            </TableCell>
            <TableCell style={mainCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'size'}
                direction={sortConfig.direction}
                onClick={() => handleSort('size')}
              >
                Size
              </TableSortLabel>
            </TableCell>
            {showColumns.whoHasIt && <TableCell style={mainCellStyle}>Who Has It?</TableCell>}
            <TableCell style={mainCellStyle}>Believed Value</TableCell>
            <TableCell style={mainCellStyle}>Average Appraisal</TableCell>
            {showColumns.pendingSale && (
              <TableCell style={mainCellStyle}>
                <TableSortLabel
                  active={sortConfig.key === 'status'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('status')}
                >
                  Pending Sale
                </TableSortLabel>
              </TableCell>
            )}
            <TableCell style={mainCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'session_date'}
                direction={sortConfig.direction}
                onClick={() => handleSort('session_date')}
              >
                Session Date
              </TableSortLabel>
            </TableCell>
            <TableCell style={mainCellStyle}>Last Update</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loot.map((item) => {
            const individualItems = getIndividualItems(item.name);
            const totalQuantity = individualItems.reduce((sum, item) => sum + item.quantity, 0);

            return (
              <React.Fragment key={`${item.name}-${item.unidentified}-${item.type}-${item.size}`}>
                <TableRow>
                  {showColumns.select && (
                    <TableCell style={mainCellStyle}>
                      <Checkbox
                        checked={individualItems.every((item) => selectedItems.includes(item.id))}
                        indeterminate={
                          individualItems.some((item) => selectedItems.includes(item.id)) &&
                          !individualItems.every((item) => selectedItems.includes(item.id))
                        }
                        onChange={() => individualItems.forEach((item) => handleSelectItem(item.id, setSelectedItems))}
                      />
                    </TableCell>
                  )}
                  <TableCell style={mainCellStyle}>{totalQuantity}</TableCell>
                  <TableCell style={mainCellStyle}>
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
                  {showColumns.unidentified && (
                    <TableCell style={mainCellStyle}>
                      {item.unidentified === null
                        ? ''
                        : item.unidentified
                        ? <strong>Unidentified</strong>
                        : 'Identified'}
                    </TableCell>
                  )}
                  <TableCell style={mainCellStyle}>{item.type}</TableCell>
                  <TableCell style={mainCellStyle}>{item.size}</TableCell>
                  {showColumns.whoHasIt && <TableCell style={mainCellStyle}>{item.character_name}</TableCell>}
                  <TableCell style={mainCellStyle}>{item.believedvalue || ''}</TableCell>
                  <TableCell style={mainCellStyle}>{item.average_appraisal || ''}</TableCell>
                  {showColumns.pendingSale && (
                    <TableCell style={mainCellStyle}>{item.status === 'Pending Sale' ? '✔' : ''}</TableCell>
                  )}
                  <TableCell style={mainCellStyle}>{item.session_date ? formatDate(item.session_date) : ''}</TableCell>
                  <TableCell style={mainCellStyle}>{item.lastupdate ? formatDate(item.lastupdate) : ''}</TableCell>
                </TableRow>
                {individualItems.length > 1 && (
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={showColumns.unidentified ? 11 : 10}>
                      <Collapse in={openItems[item.name]} timeout="auto" unmountOnExit>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              {showColumns.select && <TableCell style={subCellStyle}>Select</TableCell>}
                              <TableCell style={subCellStyle}>Quantity</TableCell>
                              <TableCell style={subCellStyle}>Size</TableCell>
                              <TableCell style={subCellStyle}>Session Date</TableCell>
                              <TableCell style={subCellStyle}>Last Update</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {individualItems.map((subItem) => (
                              <SubItemTableRow key={subItem.id}>
                                {showColumns.select && (
                                  <TableCell style={subCellStyle}>
                                    <Checkbox
                                      checked={selectedItems.includes(subItem.id)}
                                      onChange={() => handleSelectItem(subItem.id, setSelectedItems)}
                                    />
                                  </TableCell>
                                )}
                                <TableCell style={subCellStyle}>{subItem.quantity}</TableCell>
                                <TableCell style={subCellStyle}>{subItem.size}</TableCell>
                                <TableCell style={subCellStyle}>{subItem.session_date ? formatDate(subItem.session_date) : ''}</TableCell>
                                <TableCell style={subCellStyle}>{subItem.lastupdate ? formatDate(subItem.lastupdate) : ''}</TableCell>
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
