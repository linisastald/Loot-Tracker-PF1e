import React from 'react';
import { TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Paper, Checkbox, IconButton, Collapse, TableSortLabel, Tooltip } from '@mui/material';
import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';
import { formatDate } from '../utils/utils'; // Adjust the path as necessary

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

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Select</TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'quantity'}
                direction={sortConfig.direction}
                onClick={() => handleSort('quantity')}
              >
                Quantity
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'name'}
                direction={sortConfig.direction}
                onClick={() => handleSort('name')}
              >
                Name
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'unidentified'}
                direction={sortConfig.direction}
                onClick={() => handleSort('unidentified')}
              >
                Unidentified
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'type'}
                direction={sortConfig.direction}
                onClick={() => handleSort('type')}
              >
                Type
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'size'}
                direction={sortConfig.direction}
                onClick={() => handleSort('size')}
              >
                Size
              </TableSortLabel>
            </TableCell>
            <TableCell>Believed Value</TableCell>
            <TableCell>Average Appraisal</TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'status'}
                direction={sortConfig.direction}
                onClick={() => handleSort('status')}
              >
                Pending Sale
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortConfig.key === 'session_date'}
                direction={sortConfig.direction}
                onClick={() => handleSort('session_date')}
              >
                Session Date
              </TableSortLabel>
            </TableCell>
            <TableCell>Last Update</TableCell>
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
                  <TableCell>
                    <Checkbox
                      checked={individualItems.every((item) => selectedItems.includes(item.id))}
                      indeterminate={
                        individualItems.some((item) => selectedItems.includes(item.id)) &&
                        !individualItems.every((item) => selectedItems.includes(item.id))
                      }
                      onChange={() => individualItems.forEach((item) => handleSelectItem(item.id, setSelectedItems))}
                    />
                  </TableCell>
                  <TableCell>{totalQuantity}</TableCell>
                  <TableCell>
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
                  <TableCell>
                    {item.unidentified === null
                      ? ''
                      : item.unidentified
                      ? <strong>Unidentified</strong>
                      : 'Identified'}
                  </TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{item.size}</TableCell>
                  <TableCell>{item.believedvalue || ''}</TableCell>
                  <TableCell>{item.average_appraisal || ''}</TableCell>
                  <TableCell>{isPendingSale ? '✔' : ''}</TableCell>
                  <TableCell>{item.session_date ? formatDate(item.session_date) : ''}</TableCell>
                  <TableCell>{item.lastupdate ? formatDate(item.lastupdate) : ''}</TableCell>
                </TableRow>
                {individualItems.length > 1 && (
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={11}>
                      <Collapse in={openItems[item.name]} timeout="auto" unmountOnExit>
                        <Table size="small">
                          <TableBody>
                            {individualItems.map((subItem) => (
                              <TableRow key={subItem.id} style={{ backgroundColor: '#f5f5f5' }}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedItems.includes(subItem.id)}
                                    onChange={() => handleSelectItem(subItem.id, setSelectedItems)}
                                  />
                                </TableCell>
                                <TableCell>{subItem.quantity}</TableCell>
                                <TableCell>
                                  <Tooltip title={subItem.notes || 'No notes'} arrow>
                                    <span>{subItem.name}</span>
                                  </Tooltip>
                                </TableCell>
                                <TableCell>
                                  {subItem.unidentified === null
                                    ? ''
                                    : subItem.unidentified
                                    ? <strong>Unidentified</strong>
                                    : 'Identified'}
                                </TableCell>
                                <TableCell>{subItem.type}</TableCell>
                                <TableCell>{subItem.size}</TableCell>
                                <TableCell>{subItem.believedvalue || ''}</TableCell>
                                <TableCell>{subItem.appraisalroll || ''}</TableCell>
                                <TableCell>{subItem.status === 'Pending Sale' ? '✔' : ''}</TableCell>
                                <TableCell>{subItem.session_date ? formatDate(subItem.session_date) : ''}</TableCell>
                                <TableCell>{subItem.lastupdate ? formatDate(subItem.lastupdate) : ''}</TableCell>
                              </TableRow>
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
