// Shared sizes for the app shell (sidebar + app bar + content offset).
export const DRAWER_WIDTH = 240;
export const DRAWER_WIDTH_COLLAPSED = 64;
export const APP_BAR_HEIGHT = { xs: 56, md: 64 } as const;

export const drawerWidthFor = (isCollapsed: boolean): number =>
  isCollapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH;
