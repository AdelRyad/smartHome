import React, {useState, useCallback} from 'react';
import {View, StyleSheet, Text, TouchableOpacity} from 'react-native';
import Header from './Header';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

interface Props {
  retry: () => void;
  onRecoverableError: (error: Error) => void;
  children: React.ReactNode;
}

const ERROR_THRESHOLD = 3;
const ERROR_RESET_DELAY = 60000;

class ErrorBoundary extends React.Component<Props, ErrorBoundaryState> {
  private errorResetTimeout: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error) {
    return {hasError: true, error};
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Component Error:', error, errorInfo);

    this.setState(prevState => {
      const newErrorCount = prevState.errorCount + 1;
      if (newErrorCount < ERROR_THRESHOLD) {
        this.props.onRecoverableError(error);
      }
      return {errorCount: newErrorCount};
    });

    if (this.errorResetTimeout) {
      clearTimeout(this.errorResetTimeout);
    }

    this.errorResetTimeout = setTimeout(() => {
      this.setState({errorCount: 0});
    }, ERROR_RESET_DELAY);
  }

  componentWillUnmount() {
    if (this.errorResetTimeout) {
      clearTimeout(this.errorResetTimeout);
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.state.errorCount >= ERROR_THRESHOLD) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            The app encountered too many errors. Please refresh the app.
          </Text>
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                // Clean up stores and reset error state
                this.setState({
                  hasError: false,
                  error: null,
                  errorCount: 0,
                });
                this.props.retry();
              }}>
              <Text style={styles.retryButtonText}>Reset App State</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          Something went wrong. Please try again.
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            this.setState({hasError: false, error: null});
            this.props.retry();
          }}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const Layout = ({children}: {children: React.ReactNode}) => {
  const [retryKey, setRetryKey] = useState(0);

  const handleRecoverableError = useCallback((error: Error) => {
    // Log the error and potentially send it to an error tracking service
    console.error('Recoverable error:', error);
  }, []);

  const handleRetry = useCallback(() => {
    setRetryKey(prev => prev + 1);
  }, []);

  return (
    <View style={styles.container}>
      <Header />
      <ErrorBoundary
        retry={handleRetry}
        onRecoverableError={handleRecoverableError}>
        <View key={retryKey} style={styles.content}>
          {children}
        </View>
      </ErrorBoundary>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#ff3b30',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  retryButton: {
    backgroundColor: '#007aff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
  },
});

export default Layout;
