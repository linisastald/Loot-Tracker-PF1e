import React from 'react';
import BaseLootManagement from './BaseLootManagement';
import { keptPartyLootConfig } from './configs';
import useLootManagement from '../../../hooks/useLootManagement';

const KeptParty = () => {
    const {
        handleSell,
        handleTrash,
        handleKeepSelf,
    } = useLootManagement('Kept Party');

    // Configure actions specific to kept party loot
    const config = {
        ...keptPartyLootConfig,
        actions: [
            {
                label: 'Sell',
                color: 'primary' as const,
                variant: 'outlined' as const,
                handler: handleSell,
            },
            {
                label: 'Trash',
                color: 'secondary' as const,
                variant: 'outlined' as const,
                handler: handleTrash,
            },
            {
                label: 'Keep Self',
                color: 'primary' as const,
                variant: 'outlined' as const,
                handler: handleKeepSelf,
            },
        ],
    };

    return <BaseLootManagement config={config} />;
};

export default KeptParty;