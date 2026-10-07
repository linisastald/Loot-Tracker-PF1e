import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Paper, Typography } from '@mui/material';

/** Wait before automatic retry number 1, 2, 3 ...; the last value repeats. */
export const RETRY_DELAYS_MS = [2000, 5000, 10000, 15000];

export const retryDelayFor = (failedChecks: number): number =>
  RETRY_DELAYS_MS[Math.min(Math.max(failedChecks, 1), RETRY_DELAYS_MS.length) - 1];

interface ServerUnreachableProps {
  /** How many checks in a row have failed so far (1 after the first failure). */
  failedChecks: number;
  /** Re-run the check. Resolves when it finished; the parent hides this screen once it succeeds. */
  onRetry: () => Promise<void>;
}

/**
 * Full-page state shown when the app cannot find out whether the user is signed in
 * (network error, server error, rate limit). It retries on its own with a backoff
 * and offers "Try again now". Nothing about the session is cleared while it shows.
 */
const ServerUnreachable: React.FC<ServerUnreachableProps> = ({ failedChecks, onRetry }) => {
  const [retrying, setRetrying] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const retry = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      inFlight.current = false;
      if (mounted.current) setRetrying(false);
    }
  }, [onRetry]);

  // One timer per failed check; a new failure schedules the next, longer wait.
  useEffect(() => {
    const timer = setTimeout(() => { void retry(); }, retryDelayFor(failedChecks));
    return () => clearTimeout(timer);
  }, [failedChecks, retry]);

  const seconds = Math.round(retryDelayFor(failedChecks) / 1000);

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: 'background.default',
        p: 2,
      }}
    >
      <Container maxWidth="sm">
        <Paper sx={{ p: { xs: 3, md: 4 }, textAlign: 'center' }} role="alert">
          <Typography variant="h4" component="h1" gutterBottom>
            Can&apos;t reach the server
          </Typography>
          <Typography sx={{ mb: 2 }}>
            The app could not check whether you are signed in. The server may be restarting or your
            connection may be down. You have not been signed out, and nothing you saved has been lost.
          </Typography>
          <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>
            {retrying ? 'Trying to reach the server...' : `Trying again automatically in about ${seconds} seconds.`}
          </Alert>
          <Button
            variant="contained"
            onClick={() => { void retry(); }}
            disabled={retrying}
            startIcon={retrying ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Try again now
          </Button>
        </Paper>
      </Container>
    </Box>
  );
};

export default ServerUnreachable;
