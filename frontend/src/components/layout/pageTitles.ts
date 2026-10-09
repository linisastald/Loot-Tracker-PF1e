// Header title for each page, matched on the first path segment so nested
// routes (/loot-management/sold, /item-management/...) share their page's title.
// Keep in step with the page routes in App.tsx and the labels in Sidebar.jsx.
const PAGE_TITLES: Record<string, string> = {
  'loot-entry': 'Loot Entry',
  'loot-management': 'Loot Management',
  'gold-transactions': 'Gold Transactions',
  'user-settings': 'Account & Settings',
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
};

/** The page title for a pathname, or null for an unknown path. */
export const getPageTitle = (pathname: string): string | null =>
  PAGE_TITLES[pathname.split('/')[1] ?? ''] ?? null;

/**
 * Pages that belong to the user's account rather than to a campaign
 * (Account & Settings: account, characters across campaigns, System Admin).
 * The layout renders them under the default theme, without the campaign
 * banners, and even for a user who belongs to no campaign.
 */
export const isCampaignAgnosticPath = (pathname: string): boolean =>
  pathname === '/user-settings' || pathname.startsWith('/user-settings/');
