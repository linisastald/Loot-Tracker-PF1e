// CustomLootTable.js

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  IconButton,
  Collapse,
  TableSortLabel,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';

const CustomLootTable = ({
  loot,
  selectedItems,
  setSelectedItems,
  setUpdatedEntry,
  setUpdateDialogOpen,
  setSplitQuantities,
  setSplitDialogOpen,
  handleSelectItem,
  formatDate,
}) => {
  const [openItems, setOpenItems] = React.useState({});

  const handleToggleOpen = (name) => {
    setOpenItems((prevOpenItems) => ({
      ...prevOpenItems,
      [name]: !prevOpenItems[name],
    }));
  };

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Select</TableCell>
            <TableCell>
              <TableSortLabel>
                Quantity
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel>
                Name
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel>
                Unidentified
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel>
                Type
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel>
                Size
              </TableSortLabel>
            </TableCell>
            <TableCell>Believed Value</TableCell>
            <TableCell>Average Appraisal</TableCell>
            <TableCell>
              <TableSortLabel>
                Pending Sale
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel>
                Session Date
              </TableSortLabel>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loot.summary.map((item) => {
            const individualItems = loot.individual.filter((subItem) => subItem.name === item.name);
            const totalQuantity = individualItems.reduce((sum, subItem) => sum + subItem.quantity, 0);
            const isPendingSale = individualItems.some((subItem) => subItem.status === 'Pending Sale');

            return (
              <React.Fragment key={item.name}>
                <TableRow>
                  <TableCell>
                    <Checkbox
                      checked={individualItems.every((subItem) => selectedItems.includes(subItem.id))}
                      indeterminate={
                        individualItems.some((subItem) => selectedItems.includes(subItem.id)) &&
                        !individualItems.every((subItem) => selectedItems.includes(subItem.id))
                      }
                      onChange={() => individualItems.forEach((subItem) => handleSelectItem(subItem.id, selectedItems, setSelectedItems))}
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
                    {item.name}
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
                  <TableCell>
                    {item.session_date ? formatDate(item.session_date) : ''}
                  </TableCell>
                </TableRow>
                {individualItems.length > 1 && (
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={10}>
                      <Collapse in={openItems[item.name]} timeout="auto" unmountOnExit>
                        <Table size="small">
                          <TableBody>
                            {individualItems.map((subItem) => (
                              <TableRow key={subItem.id}>
                                <TableCell>
                                  <Checkbox
                                    checked={selectedItems.includes(subItem.id)}
                                    onChange={() => handleSelectItem(subItem.id, selectedItems, setSelectedItems)}
                                  />
                                </TableCell>
                                <TableCell>{subItem.quantity}</TableCell>
                                <TableCell>{subItem.name}</TableCell>
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
                                <TableCell>
                                  {subItem.session_date ? formatDate(subItem.session_date) : ''}
                                </TableCell>
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
