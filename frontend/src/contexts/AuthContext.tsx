import React, { createContext, useContext } from 'react';

export interface AuthUser {
  id: number;
  username: string;
  email?: string;
  /** Legacy global role from the JWT; per-campaign roles live in CampaignContext. */
  role: string;
  discord_id?: string;
  activeCharacter?: { name?: string };
  activeCharacterId?: number | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** Re-read the signed-in user from the server (e.g. after the active character changed) */
  refreshUser: () => Promise<void>;
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
  user: AuthUser | null;
  isAuthenticated: boolean;
  onRefreshUser?: () => Promise<void>;
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({
  user,
  isAuthenticated,
  onRefreshUser,
  children,
}) => {
  const value: AuthContextType = {
    user,
    isAuthenticated,
    refreshUser: onRefreshUser ?? (async () => {}),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
