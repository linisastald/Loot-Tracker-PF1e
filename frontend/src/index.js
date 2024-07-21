import React from 'react';
import ReactDOM from 'react-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
import './globalStyles.css';

console.log('REACT_APP_API_URL:', process.env.REACT_APP_API_URL);



const theme = createTheme({
  palette: {
    mode: 'dark', // Set to 'light' for light mode
  },
});

ReactDOM.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <App />
  </ThemeProvider>,
  document.getElementById('root')
);
