import React from 'react';
import BaseLootManagement from './BaseLootManagement';
import { keptPartyLootConfig } from './configs';

const KeptParty = () => {
    const config = {
        ...keptPartyLootConfig,
        actions: [
            {
                label: 'Sell',
                color: 'primary' as const,
                variant: 'outlined' as const,
                actionKey: 'sell' as const,
            },
            {
                label: 'Trash',
                color: 'secondary' as const,
                variant: 'outlined' as const,
                actionKey: 'trash' as const,
            },
            {
                label: 'Keep Self',
                color: 'primary' as const,
                variant: 'outlined' as const,
                actionKey: 'keepSelf' as const,
            },
        ],
    };

    return <BaseLootManagement config={config} />;
};

export default KeptParty;
