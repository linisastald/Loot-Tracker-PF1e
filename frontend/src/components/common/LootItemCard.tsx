import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Collapse,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';

interface LootItemCardProps {
  item: any;
  individualItems: any[];
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelectAll: () => void;
  onSelectItem: (id: number) => void;
  selectedItems: number[];
  showColumns: Record<string, boolean>;
  formatDateOnly: (dateString: string) => string;
  formatAppraisalDetails: (item: any) => string;
  FormatBelievedValue: React.FC<{ item: any }>;
  FormatAverageAppraisal: React.FC<{ item: any }>;
}

const LootItemCard: React.FC<LootItemCardProps> = ({
  item,
  individualItems,
  isOpen,
  onToggleOpen,
  onSelectAll,
  onSelectItem,
  selectedItems,
  showColumns,
  formatDateOnly,
  FormatBelievedValue,
  FormatAverageAppraisal,
}) => {
  const allSelected = individualItems.length > 0 && individualItems.every(i => selectedItems.includes(i.id));
  const someSelected = individualItems.some(i => selectedItems.includes(i.id));

  return (
    <Card sx={{ mb: 1, bgcolor: 'background.paper' }}>
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          {showColumns.select && (
            <Checkbox
              size="small"
              checked={allSelected}
              indeterminate={someSelected && !allSelected}
              onChange={onSelectAll}
              sx={{ p: 0.5, mt: 0.25 }}
            />
          )}
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Tooltip title={item.notes || 'No notes'} arrow>
                <Typography variant="body1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                  {item.masterwork ? 'Well Made ' : ''}{item.name}
                </Typography>
              </Tooltip>
              {item.quantity > 1 && (
                <Chip label={`x${item.quantity}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
              )}
              {item.unidentified && (
                <Chip label="Unidentified" size="small" color="warning" sx={{ height: 20, fontSize: '0.7rem' }} />
              )}
              {item.statuspage === 'Pending Sale' && (
                <Chip label="Pending Sale" size="small" color="info" sx={{ height: 20, fontSize: '0.7rem' }} />
              )}
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.75 }}>
              {showColumns.type && item.type && (
                <Typography variant="caption" color="text.secondary">{item.type}</Typography>
              )}
              {showColumns.size && item.size && (
                <Typography variant="caption" color="text.secondary">{item.size}</Typography>
              )}
              {showColumns.whoHasIt && item.character_name && (
                <Typography variant="caption" color="text.secondary">{item.character_name}</Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 0.5 }}>
              {showColumns.believedValue && (
                <Typography variant="caption" color="text.secondary">
                  Value: <FormatBelievedValue item={item} />
                </Typography>
              )}
              {showColumns.averageAppraisal && item.average_appraisal != null && (
                <Typography variant="caption" color="text.secondary">
                  Avg: <FormatAverageAppraisal item={item} />
                </Typography>
              )}
              {showColumns.sessionDate && item.session_date && (
                <Typography variant="caption" color="text.secondary">
                  {formatDateOnly(item.session_date)}
                </Typography>
              )}
            </Box>
          </Box>

          {individualItems.length > 1 && (
            <IconButton size="small" onClick={onToggleOpen} sx={{ p: 0.5 }}>
              {isOpen ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
            </IconButton>
          )}
        </Box>

        {individualItems.length > 1 && (
          <Collapse in={isOpen} timeout="auto" unmountOnExit>
            <Box sx={{ mt: 1, pl: 4, borderLeft: '2px solid', borderColor: 'divider' }}>
              {individualItems.map(subItem => (
                <Box key={subItem.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                  {showColumns.select && (
                    <Checkbox
                      size="small"
                      checked={selectedItems.includes(subItem.id)}
                      onChange={() => onSelectItem(subItem.id)}
                      sx={{ p: 0.25 }}
                    />
                  )}
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="caption">
                      Qty: {subItem.quantity}
                      {subItem.size && ` | ${subItem.size}`}
                      {subItem.character_name && ` | ${subItem.character_name}`}
                    </Typography>
                    {subItem.notes && (
                      <Tooltip title={subItem.notes} arrow>
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          (notes)
                        </Typography>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </Collapse>
        )}
      </CardContent>
    </Card>
  );
};

export default LootItemCard;
