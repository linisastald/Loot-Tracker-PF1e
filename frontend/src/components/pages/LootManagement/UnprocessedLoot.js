import React from 'react';
import BaseLootManagement from './BaseLootManagement';
import { unprocessedLootConfig } from './configs';
import useLootManagement from '../../../hooks/useLootManagement';

const UnprocessedLoot = () => {
    const {
        handleAppraise,
        handleSell,
        handleTrash,
        handleKeepSelf,
        handleKeepParty,
    } = useLootManagement(); // Get action handlers

    // Configure actions specific to unprocessed loot
    const config = {
        ...unprocessedLootConfig,
        actions: [
            {
                label: 'Appraise',
                color: 'info' as const,
                variant: 'outlined' as const,
                handler: handleAppraise,
            },
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

export default UnprocessedLoot;