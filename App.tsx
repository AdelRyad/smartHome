import * as React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import Home from './App/screens/Home';
import SettingsTabs from './App/screens/SettingsTabs'; // Import the new tab navigator
import Section from './App/screens/Section';
import ContactUsScreen from './App/screens/Contact';
import {useEffect} from 'react';
import {initDatabase} from './utils/db';

const Stack = createStackNavigator();

function App() {
  useEffect(() => {
    initDatabase()
      .then(() => {})
      .catch(error => {
        error('Failed to initialize database:', error);
      });
  }, []);
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen
          name="Home"
          component={Home}
          options={{headerShown: false, animation: 'slide_from_left'}}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsTabs}
          options={{headerShown: false, animation: 'slide_from_right'}}
        />
        <Stack.Screen
          name="Section"
          component={Section}
          options={{headerShown: false, animation: 'slide_from_right'}}
        />
        <Stack.Screen
          name="ContactUs"
          component={ContactUsScreen}
          options={{headerShown: false, animation: 'slide_from_right'}}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default App;
