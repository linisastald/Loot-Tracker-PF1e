import { createTheme } from '@mui/material/styles';

/**
 * Comprehensive consolidated theme for the Pathfinder Loot Tracker application.
 * This theme incorporates styling from:
 * - theme.js
 * - buttonOverrides.css
 * - globalStyles.css
 * - index.css
 * - Sidebar.css
 * - MainLayout.css
 */
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#5c8db8', // Muted blue
      light: '#829ebd',
      dark: '#3a6991',
      contrastText: '#121212',
    },
    secondary: {
      main: '#c77a9e', // Muted pink
      light: '#d297b4',
      dark: '#a55a7e',
      contrastText: '#121212',
    },
    error: {
      main: '#f44336',
      light: '#e57373',
      dark: '#d32f2f',
    },
    warning: {
      main: '#ff9800',
      light: '#ffb74d',
      dark: '#f57c00',
    },
    info: {
      main: '#2196f3',
      light: '#64b5f6',
      dark: '#1976d2',
    },
    success: {
      main: '#4caf50',
      light: '#81c784',
      dark: '#388e3c',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
    divider: 'rgba(255, 255, 255, 0.12)',
    text: {
      primary: '#ffffff',
      secondary: 'rgba(255, 255, 255, 0.7)',
      disabled: 'rgba(255, 255, 255, 0.5)',
    },
    action: {
      hover: 'rgba(144, 202, 249, 0.08)',
      selected: 'rgba(144, 202, 249, 0.16)',
      active: 'rgba(255, 255, 255, 0.7)',
      disabled: 'rgba(255, 255, 255, 0.3)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
    },
  },
  typography: {
    fontFamily: [
      'Roboto',
      '-apple-system',
      'BlinkMacSystemFont',
      'Segoe UI',
      'Arial',
      'sans-serif',
    ].join(','),
    h4: {
      fontWeight: 600,
      letterSpacing: '0.0075em',
    },
    h5: {
      fontWeight: 600,
      letterSpacing: '0.0075em',
    },
    h6: {
      fontWeight: 500,
      letterSpacing: '0.0075em',
    },
    subtitle1: {
      fontWeight: 500,
    },
    subtitle2: {
      color: 'rgba(255, 255, 255, 0.7)',
    },
    body1: {
      fontSize: '0.9rem',
    },
    body2: {
      fontSize: '0.85rem',
      color: 'rgba(255, 255, 255, 0.7)',
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
    // CssBaseline - Global styles from index.css and globalStyles.css
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0,
        },
        body: {
          margin: 0,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          width: '100%',
          height: '100%',
          padding: 0,
          // Global scrollbar styles from globalStyles.css
          scrollbarWidth: 'thin',
          scrollbarColor: '#888 #343434',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: '#343434',
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#888',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: '#555',
          },
        },
        code: {
          fontFamily: 'source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace',
        },
        '#root': {
          width: '100%',
          height: '100%',
        },
      },
    },
    // Container styles from globalStyles.css
    MuiContainer: {
      styleOverrides: {
        root: {
          maxWidth: 'none !important',
          padding: '20px',
          boxSizing: 'border-box',
        },
      },
    },
    // Button styles from buttonOverrides.css and theme.js
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          boxShadow: 'none',
          borderRadius: 8,
          transition: 'background-color 0.3s, transform 0.2s, box-shadow 0.2s',
        },
        contained: {
          boxShadow: '0px 1px 3px 0px rgba(0,0,0,0.12) !important',
          '&:hover': {
            boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.2) !important',
            transform: 'translateY(-1px)',
          },
        },
        outlined: {
          borderColor: 'rgba(144, 202, 249, 0.5) !important',
          color: 'rgba(255, 255, 255, 0.7) !important',
          '&:hover': {
            backgroundColor: 'rgba(144, 202, 249, 0.08) !important',
            borderColor: 'rgba(144, 202, 249, 0.7) !important',
          },
        },
        containedPrimary: {
          backgroundColor: '#5c8db8 !important',
          color: '#121212 !important',
          '&:hover': {
            backgroundColor: '#7ba7d1 !important',
          },
        },
        containedSecondary: {
          backgroundColor: '#c77a9e !important',
          color: '#121212 !important',
          '&:hover': {
            backgroundColor: '#d493b2 !important',
          },
        },
        outlinedPrimary: {
          borderColor: 'rgba(144, 202, 249, 0.5) !important',
          color: 'rgba(255, 255, 255, 0.7) !important',
          '&:hover': {
            backgroundColor: 'rgba(144, 202, 249, 0.08) !important',
            borderColor: 'rgba(144, 202, 249, 0.7) !important',
          },
        },
        outlinedSecondary: {
          borderColor: 'rgba(244, 143, 177, 0.5) !important',
          color: 'rgba(255, 255, 255, 0.7) !important',
          '&:hover': {
            backgroundColor: 'rgba(244, 143, 177, 0.08) !important',
            borderColor: 'rgba(244, 143, 177, 0.7) !important',
          },
        },
        text: {
          color: 'rgba(255, 255, 255, 0.7)',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
          },
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    // Drawer and Sidebar styles from Sidebar.css
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1e1e1e',
          borderRight: '1px solid rgba(255, 255, 255, 0.12)',
          width: (props) => props.isCollapsed ? '64px' : '240px',
          transition: 'width 0.2s',
          overflow: 'hidden',
          // Sidebar scrollbar styles
          '&::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-track': {
            background: '#343434',
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#888',
            borderRadius: '4px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: '#555',
          },
          scrollbarWidth: 'thin',
          scrollbarColor: '#888 #343434',
          msOverflowStyle: 'none',
        },
      },
    },
    // ListItem styles for sidebar from Sidebar.css
    MuiListItem: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: '#d3d3d3',
            borderLeft: '5px solid #3f51b5',
          },
          paddingLeft: '16px !important',
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        root: {
          marginLeft: '0 !important',
        },
      },
    },
    // Main layout styles from MainLayout.css
    MuiBox: {
      variants: [
        {
          props: { className: 'main-layout' },
          style: {
            display: 'flex',
            minHeight: '100vh',
          },
        },
        {
          props: { className: 'main-content' },
          style: {
            flexGrow: 1,
            padding: '20px',
            marginLeft: 0,
            width: 'calc(100% - 240px)',
            boxSizing: 'border-box',
            overflowX: 'auto',
          },
        },
      ],
    },
    // Other component styles
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: 'rgba(255, 255, 255, 0.7)',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.1), 0px 4px 5px 0px rgba(0,0,0,0.07), 0px 1px 10px 0px rgba(0,0,0,0.06)',
          borderRadius: 8,
        },
        elevation1: {
          boxShadow: '0px 1px 3px 0px rgba(0,0,0,0.12)',
        },
        elevation2: {
          boxShadow: '0px 1px 5px 0px rgba(0,0,0,0.12)',
        },
        elevation3: {
          boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.1), 0px 4px 5px 0px rgba(0,0,0,0.07), 0px 1px 10px 0px rgba(0,0,0,0.06)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.1), 0px 4px 5px 0px rgba(0,0,0,0.07), 0px 1px 10px 0px rgba(0,0,0,0.06)',
          borderRadius: 8,
          transition: 'box-shadow 0.3s',
          '&:hover': {
            boxShadow: '0px 4px 8px -1px rgba(0,0,0,0.2), 0px 6px 10px 0px rgba(0,0,0,0.14), 0px 1px 18px 0px rgba(0,0,0,0.12)',
          },
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: 16,
          '&:last-child': {
            paddingBottom: 16,
          },
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
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
          padding: '12px 16px',
        },
        head: {
          fontWeight: 600,
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          color: 'rgba(255, 255, 255, 0.87)',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-child td': {
            borderBottom: 0,
          },
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiInputBase-input': {
            borderRadius: 4,
          },
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.23)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.5)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#5c8db8',
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: 'rgba(255, 255, 255, 0.5)',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 48,
        },
        indicator: {
          height: 3,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.875rem',
          minHeight: 48,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
        standardSuccess: {
          backgroundColor: 'rgba(76, 175, 80, 0.15)',
          color: '#69f0ae',
        },
        standardError: {
          backgroundColor: 'rgba(244, 67, 54, 0.15)',
          color: '#f44336',
        },
        standardWarning: {
          backgroundColor: 'rgba(255, 152, 0, 0.15)',
          color: '#ff9800',
        },
        standardInfo: {
          backgroundColor: 'rgba(33, 150, 243, 0.15)',
          color: '#29b6f6',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.23)',
        },
      },
    },
    MuiList: {
      styleOverrides: {
        root: {
          padding: 0,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&.Mui-selected': {
            backgroundColor: 'rgba(144, 202, 249, 0.16)',
            '&:hover': {
              backgroundColor: 'rgba(144, 202, 249, 0.24)',
            },
          },
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          minWidth: 40,
          color: 'rgba(255, 255, 255, 0.5)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: 'rgba(97, 97, 97, 0.9)',
          borderRadius: 4,
          fontSize: '0.75rem',
        },
        arrow: {
          color: 'rgba(97, 97, 97, 0.9)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          padding: '16px 24px',
          fontSize: '1.125rem',
          fontWeight: 500,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '16px 24px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '8px 16px',
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: 600,
        },
      },
    },
    MuiFormControlLabel: {
      styleOverrides: {
        label: {
          fontSize: '0.9rem',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.9rem',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.12)',
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          backgroundColor: '#5c8db8',
        },
      },
    },
    MuiCollapse: {
      styleOverrides: {
        root: {
          '& .MuiListItem-root': {
            paddingLeft: '32px !important',
          },
        },
      },
    },
  },
});

export default theme;