import React from 'react';
import Sidebar from './Sidebar';
import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom'; // Import Outlet to render child routes

const MainLayout = () => {
  return (
    <Box sx={{ display: 'flex' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Outlet /> {/* Render the child routes */}
      </Box>
    </Box>
  );
};

export default MainLayout;
