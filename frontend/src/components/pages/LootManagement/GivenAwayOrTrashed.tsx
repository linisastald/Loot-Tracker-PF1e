import React from 'react';
import BaseLootManagement from './BaseLootManagement';
import { trashedLootConfig } from './configs';

// trashedLootConfig already has no actions
const GivenAwayOrTrashed = () => <BaseLootManagement config={trashedLootConfig} />;

export default GivenAwayOrTrashed;
