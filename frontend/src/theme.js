import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
      light: '#e3f2fd',
      dark: '#42a5f5',
      contrastText: '#121212',
    },
    secondary: {
      main: '#f48fb1',
      light: '#f8bbd0',
      dark: '#c2185b',
      contrastText: '#121212',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    customColor1: {
      main: '#ff9800',
      contrastText: '#121212',
    },
    customColor2: {
      main: '#4caf50',
      contrastText: '#121212',
    },
    divider: 'rgba(255, 255, 255, 0.12)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.7)',
      disabled: 'rgba(255, 255, 255, 0.5)',
    },
  },
  typography: {
    fontFamily: [
      '"Roboto"',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Arial',
      'sans-serif',
    ].join(','),
    h6: {
      fontWeight: 500,
      letterSpacing: '0.0075em',
    },
    subtitle1: {
      fontWeight: 500,
    },
    body1: {
      fontSize: '0.9rem',
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
        },
        // Style for outlined variant
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.23)',
          color: 'rgba(255, 255, 255, 0.7)',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderColor: 'rgba(255, 255, 255, 0.5)'
          },
          '&.Mui-disabled': {
            borderColor: 'rgba(255, 255, 255, 0.12)',
            color: 'rgba(255, 255, 255, 0.3)'
          }
        },
        // Style for primary outlined buttons
        outlinedPrimary: {
          borderColor: 'rgba(144, 202, 249, 0.5)',
          color: 'rgba(255, 255, 255, 0.7)',
          '&:hover': {
            backgroundColor: 'rgba(144, 202, 249, 0.08)',
            borderColor: 'rgba(144, 202, 249, 0.7)'
          }
        },
        // Style for secondary outlined buttons
        outlinedSecondary: {
          borderColor: 'rgba(244, 143, 177, 0.5)',
          color: 'rgba(255, 255, 255, 0.7)',
          '&:hover': {
            backgroundColor: 'rgba(244, 143, 177, 0.08)',
            borderColor: 'rgba(244, 143, 177, 0.7)'
          }
        },
        // Style for contained variant
        contained: {
          boxShadow: '0px 1px 3px 0px rgba(0,0,0,0.12)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.1), 0px 4px 5px 0px rgba(0,0,0,0.07), 0px 1px 10px 0px rgba(0,0,0,0.06)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0px 1px 3px 0px rgba(0,0,0,0.12)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.1), 0px 4px 5px 0px rgba(0,0,0,0.07), 0px 1px 10px 0px rgba(0,0,0,0.06)',
          borderRadius: 8,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-child td': {
            borderBottom: 0,
          },
        },
      },
    },
  },
});

export default theme;