// src/contexts/ConfigContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import configService from '../services/config.service';

const ConfigContext = createContext();

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};

export const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState({
    groupName: 'Pathfinder Loot Tracker'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const fetchedConfig = await configService.getConfig();
        setConfig(fetchedConfig);
      } catch (error) {
        console.error('Failed to fetch config:', error);
        // Keep default config on error
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  return (
    <ConfigContext.Provider value={{ config, loading }}>
      {children}
    </ConfigContext.Provider>
  );
};

export default ConfigContext;
