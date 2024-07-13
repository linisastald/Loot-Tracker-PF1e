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

  const commonCellStyle = { padding: '8px', borderBottom: 'none' };

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell style={commonCellStyle}>Select</TableCell>
            <TableCell style={commonCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'quantity'}
                direction={sortConfig.direction}
                onClick={() => handleSort('quantity')}
              >
                Quantity
              </TableSortLabel>
            </TableCell>
            <TableCell style={commonCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'name'}
                direction={sortConfig.direction}
                onClick={() => handleSort('name')}
              >
                Name
              </TableSortLabel>
            </TableCell>
            <TableCell style={commonCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'unidentified'}
                direction={sortConfig.direction}
                onClick={() => handleSort('unidentified')}
              >
                Unidentified
              </TableSortLabel>
            </TableCell>
            <TableCell style={commonCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'type'}
                direction={sortConfig.direction}
                onClick={() => handleSort('type')}
              >
                Type
              </TableSortLabel>
            </TableCell>
            <TableCell style={commonCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'size'}
                direction={sortConfig.direction}
                onClick={() => handleSort('size')}
              >
                Size
              </TableSortLabel>
            </TableCell>
            <TableCell style={commonCellStyle}>Believed Value</TableCell>
            <TableCell style={commonCellStyle}>Average Appraisal</TableCell>
            <TableCell style={commonCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'status'}
                direction={sortConfig.direction}
                onClick={() => handleSort('status')}
              >
                Pending Sale
              </TableSortLabel>
            </TableCell>
            <TableCell style={commonCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'session_date'}
                direction={sortConfig.direction}
                onClick={() => handleSort('session_date')}
              >
                Session Date
              </TableSortLabel>
            </TableCell>
            <TableCell style={commonCellStyle}>Last Update</TableCell>
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
                  <TableCell style={commonCellStyle}>
                    <Checkbox
                      checked={individualItems.every((item) => selectedItems.includes(item.id))}
                      indeterminate={
                        individualItems.some((item) => selectedItems.includes(item.id)) &&
                        !individualItems.every((item) => selectedItems.includes(item.id))
                      }
                      onChange={() => individualItems.forEach((item) => handleSelectItem(item.id, setSelectedItems))}
                    />
                  </TableCell>
                  <TableCell style={commonCellStyle}>{totalQuantity}</TableCell>
                  <TableCell style={commonCellStyle}>
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
                  <TableCell style={commonCellStyle}>
                    {item.unidentified === null
                      ? ''
                      : item.unidentified
                      ? <strong>Unidentified</strong>
                      : 'Identified'}
                  </TableCell>
                  <TableCell style={commonCellStyle}>{item.type}</TableCell>
                  <TableCell style={commonCellStyle}>{item.size}</TableCell>
                  <TableCell style={commonCellStyle}>{item.believedvalue || ''}</TableCell>
                  <TableCell style={commonCellStyle}>{item.average_appraisal || ''}</TableCell>
                  <TableCell style={commonCellStyle}>{isPendingSale ? '✔' : ''}</TableCell>
                  <TableCell style={commonCellStyle}>{item.session_date ? formatDate(item.session_date) : ''}</TableCell>
                  <TableCell style={commonCellStyle}>{item.lastupdate ? formatDate(item.lastupdate) : ''}</TableCell>
                </TableRow>
                {individualItems.length > 1 && (
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={11}>
                      <Collapse in={openItems[item.name]} timeout="auto" unmountOnExit>
                        <Table size="small">
                          <TableBody>
                            {individualItems.map((subItem) => (
                              <SubItemTableRow key={subItem.id}>
                                <TableCell style={commonCellStyle}>
                                  <Checkbox
                                    checked={selectedItems.includes(subItem.id)}
                                    onChange={() => handleSelectItem(subItem.id, setSelectedItems)}
                                  />
                                </TableCell>
                                <TableCell style={commonCellStyle}>{subItem.quantity}</TableCell>
                                <TableCell style={commonCellStyle}>
                                  <Tooltip title={subItem.notes || 'No notes'} arrow>
                                    <span>{subItem.name}</span>
                                  </Tooltip>
                                </TableCell>
                                <TableCell style={commonCellStyle}>
                                  {subItem.unidentified === null
                                    ? ''
                                    : subItem.unidentified
                                    ? <strong>Unidentified</strong>
                                    : 'Identified'}
                                </TableCell>
                                <TableCell style={commonCellStyle}>{subItem.type}</TableCell>
                                <TableCell style={commonCellStyle}>{subItem.size}</TableCell>
                                <TableCell style={commonCellStyle}>{subItem.believedvalue || ''}</TableCell>
                                <TableCell style={commonCellStyle}>{subItem.appraisalroll || ''}</TableCell>
                                <TableCell style={commonCellStyle}>{subItem.status === 'Pending Sale' ? '✔' : ''}</TableCell>
                                <TableCell style={commonCellStyle}>{subItem.session_date ? formatDate(subItem.session_date) : ''}</TableCell>
                                <TableCell style={commonCellStyle}>{subItem.lastupdate ? formatDate(subItem.lastupdate) : ''}</TableCell>
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
