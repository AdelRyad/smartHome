import React, {useState, useEffect} from 'react';
import {View, StyleSheet, Text, TouchableOpacity} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';

// Import stores
import useWorkingHoursStore from './utils/workingHoursStore';
import useCleaningHoursStore from './utils/cleaningHoursStore';
import useDpsPressureStore from './utils/dpsPressureStore';
import usePressureButtonStore from './utils/pressureButtonStore';
import useSectionsPowerStatusStore from './utils/sectionsPowerStatusStore';

// Import screens and components
import Home from './App/screens/Home';
import Section from './App/screens/Section';
import Contact from './App/screens/Contact';
import SettingsTabs from './App/screens/SettingsTabs';

const Stack = createStackNavigator();

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Simple cleanup function
const cleanupStores = async () => {
  try {
    // Cleanup all stores
    useWorkingHoursStore.getState().cleanup();
    useCleaningHoursStore.getState().cleanup();
    useDpsPressureStore.getState().cleanup();
    usePressureButtonStore.getState().cleanup();
    useSectionsPowerStatusStore.getState().cleanup();
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
};

class ErrorBoundary extends React.Component<{}, ErrorBoundaryState> {
  constructor(props: {}) {
    super(props);
    this.state = {hasError: false, error: null};
  }

  static getDerivedStateFromError(error: Error) {
    return {hasError: true, error};
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  handleRetry = async () => {
    await cleanupStores();
    this.setState({hasError: false, error: null});
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            The application encountered an error.
          </Text>
          <TouchableOpacity
            style={styles.restartButton}
            onPress={this.handleRetry}>
            <Text style={styles.restartButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const App = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Add any critical initialization here
        setIsReady(true);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        await cleanupStores();
      }
    };

    initializeApp();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
          }}>
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="Settings" component={SettingsTabs} />
          <Stack.Screen name="Section" component={Section} />
          <Stack.Screen name="Contact" component={Contact} />
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  restartButton: {
    backgroundColor: '#007aff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  restartButtonText: {
    color: '#fff',
    fontSize: 16,
  },
});

export default App;
