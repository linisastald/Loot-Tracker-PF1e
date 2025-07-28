import React from 'react';
import { Box, Button, Typography, Paper, Alert } from '@mui/material';
import { Refresh, BugReport } from '@mui/icons-material';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // Update state with error details
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // TODO: In production, log to error reporting service
    // Example: Sentry, LogRocket, or custom error reporting
    // this.logErrorToService(error, errorInfo);
  }

  logErrorToService = (error, errorInfo) => {
    // Placeholder for error reporting service integration
    // In production, you would send this to your error tracking service
    console.warn('Error logged to service:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    });
  };

  handleRetry = () => {
    const newRetryCount = this.state.retryCount + 1;
    
    // Limit retry attempts to prevent infinite loops
    if (newRetryCount > 3) {
      this.handleReload();
      return;
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: newRetryCount
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Render fallback UI
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
          <Paper 
            elevation={3} 
            sx={{ 
              padding: 4, 
              maxWidth: 600, 
              width: '100%',
              textAlign: 'center' 
            }}
          >
            <BugReport 
              sx={{ 
                fontSize: 64, 
                color: 'error.main', 
                marginBottom: 2 
              }} 
            />
            
            <Typography variant="h4" gutterBottom color="error">
              Oops! Something went wrong
            </Typography>
            
            <Typography variant="body1" paragraph color="text.secondary">
              The application encountered an unexpected error. Don't worry, your data is safe.
            </Typography>

            {this.state.retryCount < 3 ? (
              <Alert severity="info" sx={{ marginBottom: 2 }}>
                Try refreshing the page or clicking retry below.
              </Alert>
            ) : (
              <Alert severity="warning" sx={{ marginBottom: 2 }}>
                Multiple retry attempts failed. The page will reload to reset the application.
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="contained"
                startIcon={<Refresh />}
                onClick={this.handleRetry}
                disabled={this.state.retryCount >= 3}
              >
                {this.state.retryCount >= 3 ? 'Reloading...' : 'Try Again'}
              </Button>
              
              <Button
                variant="outlined"
                onClick={this.handleReload}
              >
                Reload Page
              </Button>
            </Box>

            {/* Show error details in development */}
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

    // Render children normally if no error
    return this.props.children;
  }
}

export default ErrorBoundary;