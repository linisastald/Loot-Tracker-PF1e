// frontend/src/utils/auth.ts

/**
 * Whether the user cached in localStorage has the (legacy, global) DM role.
 *
 * This is a render hint only: the cached value is user-editable and ignores the
 * per-campaign role, so every DM-only action is still authorized by the backend
 * (checkRole / hasDmRights).
 * @returns true if the cached user's role is 'DM', false otherwise
 */
export const isDM = (): boolean => {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    const user: { role?: string } | null = JSON.parse(userStr);
    return user?.role === 'DM';
  } catch {
    return false;
  }
};
