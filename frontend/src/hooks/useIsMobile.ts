import { useMediaQuery, useTheme } from '@mui/material';

export const useIsMobile = (breakpoint: 'sm' | 'md' = 'md') => {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down(breakpoint));
};
