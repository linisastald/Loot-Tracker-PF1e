import React from 'react';
import BaseLootManagement from './BaseLootManagement';
import { trashedLootConfig } from './configs';

const GivenAwayOrTrashed = () => {
    // Trashed items typically have no actions, so we use the base config
    const config = {
        ...trashedLootConfig,
        actions: [], // No actions for trashed items
    };

    return <BaseLootManagement config={config} />;
};

export default GivenAwayOrTrashed;