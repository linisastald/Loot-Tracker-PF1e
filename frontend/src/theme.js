import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark', // Ensuring dark mode is set
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
     customColor1: {
      main: '#ff9800',
      contrastText: '#fff',
    },
    customColor2: {
      main: '#4caf50',
      contrastText: '#000',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
  },
});

export default theme;
