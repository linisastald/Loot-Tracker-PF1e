import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import api from '../utils/api';

interface User {
  id: number;
  username: string;
  email?: string;
  role: string;
  discord_id?: string;
  activeCharacter?: any;
  activeCharacterId?: number;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isDM: boolean;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  user: any;
  isAuthenticated: boolean;
  onUserUpdate: (user: any) => void;
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({
  user,
  isAuthenticated,
  onUserUpdate,
  children,
}) => {
  const refreshUser = useCallback(async () => {
    try {
      const response = await api.get('/auth/status');
      if (response?.data?.success && response.data.user) {
        onUserUpdate(response.data.user);
      }
    } catch (error) {
      // Silently fail - user stays as-is
    }
  }, [onUserUpdate]);

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isDM: user?.role === 'DM',
    refreshUser,
    setUser: onUserUpdate,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
