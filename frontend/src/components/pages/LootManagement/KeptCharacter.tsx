import React from 'react';
import BaseLootManagement from './BaseLootManagement';
import { keptCharacterLootConfig } from './configs';
import useLootManagement from '../../../hooks/useLootManagement';

const KeptCharacter = () => {
    const {
        handleSell,
        handleTrash,
        handleKeepParty,
    } = useLootManagement('Kept Self');

    // Configure actions specific to kept character loot
    const config = {
        ...keptCharacterLootConfig,
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
                label: 'Keep Party',
                color: 'primary' as const,
                variant: 'outlined' as const,
                handler: handleKeepParty,
            },
        ],
    };

    return <BaseLootManagement config={config} />;
};

export default KeptCharacter;