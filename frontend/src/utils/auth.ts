// frontend/src/utils/auth.ts

export type UserRole = 'DM' | 'Player' | 'Admin';

export interface StoredUser {
  id: number;
  username: string;
  role: UserRole;
  activeCharacterId?: number;
  email?: string;
}

/**
 * Get the current user's role from localStorage
 * @returns The user's role or null if not found/invalid
 */
export const getUserRole = (): UserRole | null => {
  // Get role from user data in localStorage
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;

  try {
    const user: StoredUser = JSON.parse(userStr);
    return user.role || null;
  } catch (e) {
    console.error('Invalid user data:', e);
    return null;
  }
};

/**
 * Check if the current user is a DM
 * @returns true if user is a DM, false otherwise
 */
export const isDM = (): boolean => {
  return getUserRole() === 'DM';
};

/**
 * Check if the current user is a Player
 * @returns true if user is a Player, false otherwise
 */
export const isPlayer = (): boolean => {
  return getUserRole() === 'Player';
};

/**
 * Check if the current user is an Admin
 * @returns true if user is an Admin, false otherwise
 */
export const isAdmin = (): boolean => {
  return getUserRole() === 'Admin';
};

/**
 * Get the stored user data from localStorage
 * @returns The stored user object or null if not found/invalid
 */
export const getStoredUser = (): StoredUser | null => {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;

  try {
    const user: StoredUser = JSON.parse(userStr);
    return user;
  } catch (e) {
    console.error('Invalid user data:', e);
    return null;
  }
};

/**
 * Store user data in localStorage
 * @param user The user data to store
 */
export const setStoredUser = (user: StoredUser): void => {
  try {
    localStorage.setItem('user', JSON.stringify(user));
  } catch (e) {
    console.error('Failed to store user data:', e);
  }
};

/**
 * Clear stored user data from localStorage
 */
export const clearStoredUser = (): void => {
  localStorage.removeItem('user');
};

/**
 * Check if user has permission for a specific action
 * @param requiredRole The minimum role required
 * @returns true if user has permission, false otherwise
 */
export const hasPermission = (requiredRole: UserRole): boolean => {
  const currentRole = getUserRole();
  if (!currentRole) return false;

  // Role hierarchy: Admin > DM > Player
  const roleHierarchy: Record<UserRole, number> = {
    'Player': 1,
    'DM': 2,
    'Admin': 3
  };

  return roleHierarchy[currentRole] >= roleHierarchy[requiredRole];
};