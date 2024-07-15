import React from 'react';
import Sidebar from './Sidebar';
import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom'; // Import Outlet to render child routes

const MainLayout = () => {
  return (
    <Box className="main-layout">
      <Sidebar />
      <Box className="content" sx={{ width: '90%' }}>
        <Outlet /> {/* Render the child routes */}
      </Box>
    </Box>
  );
};

export default MainLayout;
