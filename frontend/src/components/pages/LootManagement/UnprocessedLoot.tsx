import React from 'react';
import BaseLootManagement from './BaseLootManagement';
import { unprocessedLootConfig } from './configs';

const UnprocessedLoot = () => {
    const config = {
        ...unprocessedLootConfig,
        actions: [
            {
                label: 'Appraise',
                color: 'info' as const,
                variant: 'outlined' as const,
                actionKey: 'appraise' as const,
            },
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

export default UnprocessedLoot;
