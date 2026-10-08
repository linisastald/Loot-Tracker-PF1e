// frontend/src/components/layout/DmOverrideBanner.tsx
// Shown at the top of every campaign page while the superadmin's "Act as DM"
// override is on (switched in Account & Settings > System Admin). The override
// is per browser and makes the server treat the superadmin as DM even in a
// campaign where they are a Player, so it must be impossible to forget.
import React from 'react';
import { Alert, Button } from '@mui/material';
import { useCampaign } from '../../contexts/CampaignContext';

const DmOverrideBanner: React.FC = () => {
  const { dmOverride, setDmOverride, isSuperadmin } = useCampaign();

  if (!dmOverride || !isSuperadmin) return null;

  return (
    <Alert
      severity="warning"
      variant="filled"
      role="status"
      sx={{ mb: 2, alignItems: 'center' }}
      action={(
        <Button color="inherit" size="small" variant="outlined" onClick={() => setDmOverride(false)}>
          Turn off
        </Button>
      )}
    >
      <strong>Acting as DM!</strong> You are using DM functions in a campaign where you are a Player.
    </Alert>
  );
};

export default DmOverrideBanner;
