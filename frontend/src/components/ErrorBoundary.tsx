import React from 'react';
import { Box, Button, Typography, Paper, Alert } from '@mui/material';
import { Refresh, BugReport } from '@mui/icons-material';

// "Try Again" re-renders the page this many times before only a full reload is offered.
const MAX_RETRIES = 3;

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
  }

  handleRetry = () => {
    this.setState((state) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: state.retryCount + 1
    }));
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const retriesExhausted = this.state.retryCount >= MAX_RETRIES;

    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 3,
          backgroundColor: 'background.default'
        }}
      >
        <Paper elevation={3} sx={{ padding: 4, maxWidth: 600, width: '100%', textAlign: 'center' }}>
          <BugReport sx={{ fontSize: 64, color: 'error.main', marginBottom: 2 }} />

          <Typography variant="h4" gutterBottom color="error">
            Oops! Something went wrong
          </Typography>

          <Typography variant="body1" sx={{ color: "text.secondary", mb: 2 }}>
            The application encountered an unexpected error. Don&apos;t worry, your data is safe.
          </Typography>

          {retriesExhausted ? (
            <Alert severity="warning" sx={{ marginBottom: 2 }}>
              Multiple retry attempts failed. Reload the page to reset the application.
            </Alert>
          ) : (
            <Alert severity="info" sx={{ marginBottom: 2 }}>
              Try refreshing the page or clicking retry below.
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            {!retriesExhausted && (
              <Button variant="contained" startIcon={<Refresh />} onClick={this.handleRetry}>
                Try Again
              </Button>
            )}

            <Button variant={retriesExhausted ? 'contained' : 'outlined'} onClick={this.handleReload}>
              Reload Page
            </Button>
          </Box>

          {process.env.NODE_ENV === 'development' && this.state.error && (
            <Box sx={{ marginTop: 3, textAlign: 'left' }}>
              <Typography variant="h6" gutterBottom>
                Error Details (Development):
              </Typography>
              <Paper
                sx={{
                  padding: 2,
                  backgroundColor: 'grey.100',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  maxHeight: 200,
                  overflow: 'auto'
                }}
              >
                <strong>Error:</strong> {this.state.error.toString()}
                <br />
                <strong>Stack Trace:</strong>
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {this.state.error.stack}
                </pre>
              </Paper>
            </Box>
          )}
        </Paper>
      </Box>
    );
  }
}

export default ErrorBoundary;
