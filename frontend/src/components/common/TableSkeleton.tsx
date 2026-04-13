import React from 'react';
import { Box, Skeleton, Table, TableBody, TableCell, TableRow } from '@mui/material';
import { useIsMobile } from '../../hooks/useIsMobile';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

const CardSkeleton: React.FC<{ count: number }> = ({ count }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    {Array.from({ length: count }).map((_, i) => (
      <Box key={i} sx={{ p: 2, borderRadius: 1, bgcolor: 'background.paper' }}>
        <Skeleton variant="text" width="60%" height={24} />
        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
          <Skeleton variant="text" width="30%" height={20} />
          <Skeleton variant="text" width="25%" height={20} />
        </Box>
        <Skeleton variant="text" width="40%" height={20} sx={{ mt: 0.5 }} />
      </Box>
    ))}
  </Box>
);

const TableSkeleton: React.FC<TableSkeletonProps> = ({ rows = 5, columns = 4 }) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <CardSkeleton count={rows} />;
  }

  return (
    <Table>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <TableCell key={colIndex}>
                <Skeleton variant="text" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default TableSkeleton;
