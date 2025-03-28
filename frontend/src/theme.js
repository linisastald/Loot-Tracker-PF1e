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
      defaultProps: {
        // This ensures all buttons use these props by default
        disableElevation: false, // Enable elevation for hover effects
      },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 4,
          padding: '6px 16px',
          transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.2s',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0px 3px 5px -1px rgba(0,0,0,0.2), 0px 6px 10px 0px rgba(0,0,0,0.14), 0px 1px 18px 0px rgba(0,0,0,0.12)',
          },
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.23)',
          color: 'rgba(255, 255, 255, 0.7)', // text.secondary
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderColor: 'rgba(255, 255, 255, 0.5)',
          },
        },
        contained: {
          boxShadow: '0px 1px 3px 0px rgba(0,0,0,0.12)',
          '&:hover': {
            boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12)',
          },
        },
        containedPrimary: {
          backgroundColor: '#90caf9',
          '&:hover': {
            backgroundColor: '#42a5f5',
          },
        },
        containedSecondary: {
          backgroundColor: '#f48fb1',
          '&:hover': {
            backgroundColor: '#c2185b',
          },
        },
        sizeSmall: {
          padding: '4px 10px',
          fontSize: '0.8125rem',
        },
        sizeLarge: {
          padding: '8px 22px',
          fontSize: '0.9375rem',
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