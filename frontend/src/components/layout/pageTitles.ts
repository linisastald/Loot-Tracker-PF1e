// Header title for each page, matched on the first path segment so nested
// routes (/loot-management/sold, /item-management/...) share their page's title.
// Keep in step with the page routes in App.tsx and the labels in Sidebar.jsx.
const PAGE_TITLES: Record<string, string> = {
  'loot-entry': 'Loot Entry',
  'loot-management': 'Loot Management',
  'gold-transactions': 'Gold Transactions',
  'user-settings': 'User Settings',
  'character-user-management': 'Character & User Management',
  'item-management': 'Item Management',
  'consumables': 'Consumables',
  'golarion-calendar': 'Calendar',
  'loot-generator': 'Loot Generator',
  'spellbook-generator': 'Spellbook Generator',
  'tasks': 'Session Tasks',
  'task-management': 'Task Management',
  'session-management': 'Session Management',
  'sessions': 'Sessions',
  'identify': 'Identify Items',
  'infamy': 'Infamy',
  'harrow': 'Harrow Points',
  'ships': 'Ships',
  'crew': 'Crew',
  'outposts': 'Outposts',
  'city-services': 'City Services',
  'system-admin': 'System Admin',
};

/** The page title for a pathname, or null for an unknown path. */
export const getPageTitle = (pathname: string): string | null =>
  PAGE_TITLES[pathname.split('/')[1] ?? ''] ?? null;
