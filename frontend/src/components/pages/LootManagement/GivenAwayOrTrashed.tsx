import React from 'react';
import BaseLootManagement from './BaseLootManagement';
import { trashedLootConfig } from './configs';
import { useIsDM } from '../../../contexts/CampaignContext';

// Players only look at this page. A DM can select trashed items and put them
// back where they were (the History log remembers the earlier status).
const GivenAwayOrTrashed = () => {
  const isDM = useIsDM();
  const config = isDM
    ? {
        ...trashedLootConfig,
        showColumns: { ...trashedLootConfig.showColumns, select: true },
        actions: [
          {
            label: 'Restore',
            color: 'primary' as const,
            variant: 'outlined' as const,
            actionKey: 'restore' as const,
          },
        ],
        containerProps: { sx: { pb: '80px' } },
      }
    : trashedLootConfig;

  return <BaseLootManagement config={config} />;
};

export default GivenAwayOrTrashed;
