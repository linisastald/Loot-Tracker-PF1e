import React from 'react';
import BaseLootManagement from './BaseLootManagement';
import { keptCharacterLootConfig } from './configs';

const KeptCharacter = () => {
    const config = {
        ...keptCharacterLootConfig,
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
                label: 'Keep Party',
                color: 'primary' as const,
                variant: 'outlined' as const,
                actionKey: 'keepParty' as const,
            },
        ],
    };

    return <BaseLootManagement config={config} />;
};

export default KeptCharacter;
