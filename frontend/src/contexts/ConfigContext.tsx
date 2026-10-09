// src/contexts/ConfigContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import configService, { DEFAULT_CONFIG } from '../services/config.service';

interface AppConfig {
  groupName: string;
  [key: string]: unknown;
}

interface ConfigContextType {
  config: AppConfig;
}

interface ConfigProviderProps {
  children: React.ReactNode;
}

const ConfigContext = createContext<ConfigContextType | null>(null);

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    // getConfig never rejects: it resolves to the defaults on failure
    configService.getConfig().then(setConfig);
  }, []);

  return (
    <ConfigContext.Provider value={{ config }}>
      {children}
    </ConfigContext.Provider>
  );
};

export default ConfigContext;
