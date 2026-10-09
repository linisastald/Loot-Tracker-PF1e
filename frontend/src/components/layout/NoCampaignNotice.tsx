// src/components/layout/NoCampaignNotice.tsx
// Shown instead of the page content when the logged-in user belongs to no
// campaign. Campaign-scoped API routes answer 403 for such a user, so this
// gives them the one useful action: redeem an invite code.
import React, { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from '@mui/material';
import api from '../../utils/api';
import { useCampaign } from '../../contexts/CampaignContext';
import { INVITE_CODE_FORMAT_MESSAGE, INVITE_CODE_LENGTH, isValidInviteCode } from '../../utils/inviteCode';


interface NoCampaignNoticeProps {
  onLogout: () => void;
}

const NoCampaignNotice: React.FC<NoCampaignNoticeProps> = ({ onLogout }) => {
  const { switchCampaign } = useCampaign();
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!isValidInviteCode(code)) {
      setError(INVITE_CODE_FORMAT_MESSAGE);
      return;
    }
    setJoining(true);
    setError('');
    try {
      const response: any = await api.post('/invites/redeem', { code });
      const campaignId = response?.data?.campaign?.id;
      if (!campaignId) {
        throw new Error('Malformed redeem response');
      }
      switchCampaign(campaignId);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to redeem invite code');
      setJoining(false);
    }
  };

  return (
    <Paper sx={{ maxWidth: 480, mx: 'auto', mt: 6, p: 3 }}>
      <Typography variant="h5" component="h1" gutterBottom>
        You are not in a campaign
      </Typography>
      <Typography sx={{ mb: 2 }}>
        Your account does not belong to any campaign yet. Enter the invite code your DM gave you to join one.
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <TextField
        fullWidth
        label="Invite Code"
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
        slotProps={{ htmlInput: { maxLength: INVITE_CODE_LENGTH } }}
        disabled={joining}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleJoin();
          }
        }}
      />
      <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
        <Button
          variant="contained"
          onClick={handleJoin}
          disabled={joining || !inviteCode.trim()}
          startIcon={joining ? <CircularProgress size={16} /> : undefined}
        >
          Join campaign
        </Button>
        <Button onClick={onLogout} disabled={joining}>
          Log out
        </Button>
      </Box>
    </Paper>
  );
};

export default NoCampaignNotice;
