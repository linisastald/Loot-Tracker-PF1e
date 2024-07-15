import React from 'react';
import {
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Checkbox,
  IconButton,
  Collapse,
  TableSortLabel,
  Tooltip,
} from '@mui/material';
import { KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';
import { formatDate } from '../utils/utils';
import { styled } from '@mui/system';

const SubItemTableRow = styled(TableRow)(({ theme }) => ({
  backgroundColor: theme.palette.action.hover,
  '& .MuiTableCell-root': {
    padding: '4px',
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
    whoHasIt: true,
  },
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

  const mainCellStyle = { padding: '16px' };
  const subCellStyle = { padding: '4px' };

  const handleItemSelection = (id) => {
    setSelectedItems((prevSelectedItems) =>
      prevSelectedItems.includes(id)
        ? prevSelectedItems.filter((item) => item !== id)
        : [...prevSelectedItems, id]
    );
  };

  return (
    <TableContainer component={Paper} sx={{ maxWidth: '100vw', overflowX: 'auto' }}>
      <Table sx={{ minWidth: 800 }}>
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
            {showColumns.whoHasIt && (
              <TableCell style={mainCellStyle}>
                <TableSortLabel
                  active={sortConfig.key === 'whoHasIt'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('whoHasIt')}
                >
                  Who Has It?
                </TableSortLabel>
              </TableCell>
            )}
            <TableCell style={mainCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'believedValue'}
                direction={sortConfig.direction}
                onClick={() => handleSort('believedValue')}
              >
                Believed Value
              </TableSortLabel>
            </TableCell>
            <TableCell style={mainCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'averageAppraisal'}
                direction={sortConfig.direction}
                onClick={() => handleSort('averageAppraisal')}
              >
                Average Appraisal
              </TableSortLabel>
            </TableCell>
            <TableCell style={mainCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'sessionDate'}
                direction={sortConfig.direction}
                onClick={() => handleSort('sessionDate')}
              >
                Session Date
              </TableSortLabel>
            </TableCell>
            <TableCell style={mainCellStyle}>
              <TableSortLabel
                active={sortConfig.key === 'lastUpdate'}
                direction={sortConfig.direction}
                onClick={() => handleSort('lastUpdate')}
              >
                Last Update
              </TableSortLabel>
            </TableCell>
            {showColumns.pendingSale && (
              <TableCell style={mainCellStyle}>
                <TableSortLabel
                  active={sortConfig.key === 'pendingSale'}
                  direction={sortConfig.direction}
                  onClick={() => handleSort('pendingSale')}
                >
                  Pending Sale
                </TableSortLabel>
              </TableCell>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {loot.map((item) => (
            <React.Fragment key={item.name}>
              <TableRow>
                {showColumns.select && (
                  <TableCell>
                    <Checkbox
                      checked={selectedItems.includes(item.name)}
                      onChange={() => handleItemSelection(item.name)}
                    />
                  </TableCell>
                )}
                <TableCell style={mainCellStyle}>
                  <Tooltip title={item.quantity || ''}>
                    <span>{item.quantity}</span>
                  </Tooltip>
                </TableCell>
                <TableCell style={mainCellStyle}>
                  <Tooltip title={item.name || ''}>
                    <span>{item.name}</span>
                  </Tooltip>
                </TableCell>
                {showColumns.unidentified && (
                  <TableCell style={mainCellStyle}>
                    <Tooltip title={item.unidentified ? 'Yes' : 'No'}>
                      <span>{item.unidentified ? 'Yes' : 'No'}</span>
                    </Tooltip>
                  </TableCell>
                )}
                <TableCell style={mainCellStyle}>
                  <Tooltip title={item.type || ''}>
                    <span>{item.type}</span>
                  </Tooltip>
                </TableCell>
                <TableCell style={mainCellStyle}>
                  <Tooltip title={item.size || ''}>
                    <span>{item.size}</span>
                  </Tooltip>
                </TableCell>
                {showColumns.whoHasIt && (
                  <TableCell style={mainCellStyle}>
                    <Tooltip title={item.whoHasIt || ''}>
                      <span>{item.whoHasIt}</span>
                    </Tooltip>
                  </TableCell>
                )}
                <TableCell style={mainCellStyle}>
                  <Tooltip title={item.believedValue || ''}>
                    <span>{item.believedValue}</span>
                  </Tooltip>
                </TableCell>
                <TableCell style={mainCellStyle}>
                  <Tooltip title={item.averageAppraisal || ''}>
                    <span>{item.averageAppraisal}</span>
                  </Tooltip>
                </TableCell>
                <TableCell style={mainCellStyle}>
                  <Tooltip title={formatDate(item.sessionDate) || ''}>
                    <span>{formatDate(item.sessionDate)}</span>
                  </Tooltip>
                </TableCell>
                <TableCell style={mainCellStyle}>
                  <Tooltip title={formatDate(item.lastUpdate) || ''}>
                    <span>{formatDate(item.lastUpdate)}</span>
                  </Tooltip>
                </TableCell>
                {showColumns.pendingSale && (
                  <TableCell style={mainCellStyle}>
                    <Tooltip title={item.pendingSale ? 'Yes' : 'No'}>
                      <span>{item.pendingSale ? 'Yes' : 'No'}</span>
                    </Tooltip>
                  </TableCell>
                )}
                <TableCell>
                  <IconButton
                    size="small"
                    onClick={() => handleToggleOpen(item.name)}
                  >
                    {openItems[item.name] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                  </IconButton>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={12}>
                  <Collapse in={openItems[item.name]} timeout="auto" unmountOnExit>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          {showColumns.select && <TableCell style={subCellStyle}>Select</TableCell>}
                          <TableCell style={subCellStyle}>Quantity</TableCell>
                          <TableCell style={subCellStyle}>Name</TableCell>
                          {showColumns.unidentified && <TableCell style={subCellStyle}>Unidentified</TableCell>}
                          <TableCell style={subCellStyle}>Type</TableCell>
                          <TableCell style={subCellStyle}>Size</TableCell>
                          {showColumns.whoHasIt && <TableCell style={subCellStyle}>Who Has It?</TableCell>}
                          <TableCell style={subCellStyle}>Believed Value</TableCell>
                          <TableCell style={subCellStyle}>Average Appraisal</TableCell>
                          <TableCell style={subCellStyle}>Session Date</TableCell>
                          <TableCell style={subCellStyle}>Last Update</TableCell>
                          {showColumns.pendingSale && <TableCell style={subCellStyle}>Pending Sale</TableCell>}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {getIndividualItems(item.name).map((subItem) => (
                          <SubItemTableRow key={subItem.id}>
                            {showColumns.select && (
                              <TableCell>
                                <Checkbox
                                  checked={selectedItems.includes(subItem.id)}
                                  onChange={() => handleItemSelection(subItem.id)}
                                />
                              </TableCell>
                            )}
                            <TableCell style={subCellStyle}>{subItem.quantity}</TableCell>
                            <TableCell style={subCellStyle}>{subItem.name}</TableCell>
                            {showColumns.unidentified && <TableCell style={subCellStyle}>{subItem.unidentified ? 'Yes' : 'No'}</TableCell>}
                            <TableCell style={subCellStyle}>{subItem.type}</TableCell>
                            <TableCell style={subCellStyle}>{subItem.size}</TableCell>
                            {showColumns.whoHasIt && <TableCell style={subCellStyle}>{subItem.whoHasIt}</TableCell>}
                            <TableCell style={subCellStyle}>{subItem.believedValue}</TableCell>
                            <TableCell style={subCellStyle}>{subItem.averageAppraisal}</TableCell>
                            <TableCell style={subCellStyle}>{formatDate(subItem.sessionDate)}</TableCell>
                            <TableCell style={subCellStyle}>{formatDate(subItem.lastUpdate)}</TableCell>
                            {showColumns.pendingSale && <TableCell style={subCellStyle}>{subItem.pendingSale ? 'Yes' : 'No'}</TableCell>}
                          </SubItemTableRow>
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
  );
};

export default CustomLootTable;
