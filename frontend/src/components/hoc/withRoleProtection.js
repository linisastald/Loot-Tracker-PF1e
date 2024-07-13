import React from 'react';
import { Navigate } from 'react-router-dom';

const withRoleProtection = (WrappedComponent, allowedRoles) => {
  return (props) => {
    const user = JSON.parse(localStorage.getItem('user')); // Assuming user details are stored in local storage

    if (!user || !allowedRoles.includes(user.role)) {
      return <Navigate to="/login" />;
    }

    return <WrappedComponent {...props} />;
  };
};

export default withRoleProtection;
