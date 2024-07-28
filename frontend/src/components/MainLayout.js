import React from 'react';
import Sidebar from './Sidebar';
import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import './MainLayout.css';

const MainLayout = () => {
  return (
    <Box className="main-layout">
      <Sidebar />
      <Box className="main-content">
        <Outlet />
      </Box>
    </Box>
  );
};

export default MainLayout;