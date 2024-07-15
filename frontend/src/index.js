import React from 'react';
import ReactDOM from 'react-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';

const theme = createTheme({
    components: {
        MuiContainer: {
            styleOverrides: {
                root: {
                    maxWidth: '1440px'
                },
                maxWidthMd: {
                    maxWidth: 320,
                },
                maxWidthLg: {
                    maxWidth: '1440px!important',
                },
            },
        },
        palette: {
            mode: 'dark', // Set to 'light' for light mode
        },
    }
});

ReactDOM.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <App />
  </ThemeProvider>,
  document.getElementById('root')
);
