import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {createMaterialTopTabNavigator} from '@react-navigation/material-top-tabs';
import IpAddressScreen from '../tabs/IpAddressScreen';
import LampLifeScreen from '../tabs/LampLifeScreen';
import CleaningScreen from '../tabs/CleaningScreen';
import ContactScreen from '../tabs/ContactScreen';
import PopupModal from '../../components/PopupModal';
import {LockIcon} from '../../icons';
import {COLORS} from '../../constants/colors';
import {useNavigation, NavigationProp} from '@react-navigation/native';

// --- Define Navigation Prop Type ---
// Assuming 'Settings' is the name of this route in your navigator stack
// and it can navigate to 'Home'
type RootStackParamList = {
  Home: undefined; // Assuming Home takes no params
  Settings: undefined; // Assuming Settings takes no params
  // Add other routes and their params here
};
type SettingsScreenNavigationProp = NavigationProp<
  RootStackParamList,
  'Settings'
>;

const Tab = createMaterialTopTabNavigator();

const SettingsTabs = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [password, setPassword] = useState(['', '', '', '']);
  const [isModalVisible, setIsModalVisible] = useState(true);

  useEffect(() => {
    checkPasswordStatus();
  }, []);

  const checkPasswordStatus = async () => {
    const hasEnteredPassword = false;
    console.log('hasEnteredPassword', hasEnteredPassword);
  };

  const handleKeyPress = (key: string | number) => {
    let newPassword = [...password];

    if (key === 'DEL') {
      // Find the index of the last non-empty digit
      let lastFilledIndex = newPassword.length - 1;
      while (lastFilledIndex >= 0 && newPassword[lastFilledIndex] === '') {
        lastFilledIndex--;
      }

      // If a non-empty digit is found, clear it
      if (lastFilledIndex >= 0) {
        newPassword[lastFilledIndex] = '';
      }
    } else {
      // Find the first empty digit and fill it
      const firstEmptyIndex = newPassword.findIndex(p => p === '');
      if (firstEmptyIndex !== -1) {
        newPassword[firstEmptyIndex] = key.toString();
      }
    }

    setPassword(newPassword);

    // Check if the password is correct
    if (newPassword.join('') === '3645') {
      setIsModalVisible(false);
      setIsPasswordRequired(false);
    }
  };

  return (
    <>
      <PopupModal
        hideAcitons={true}
        visible={isModalVisible}
        onClose={() => {
          setIsModalVisible(false);
          navigation.navigate('Home'); // Navigate to Home on close
        }}
        title="Enter Password"
        onConfirm={() => {}}
        Icon={LockIcon}>
        <View style={styles.otpContainer}>
          {password.map((digit, index) => (
            <View key={index} style={styles.otpBox}>
              <Text style={styles.otpText}>{digit}</Text>
            </View>
          ))}
        </View>
        <View style={styles.keypad}>
          {[
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
            ['0', 'DEL'],
          ].map((row, rowIndex) => (
            <View key={rowIndex} style={styles.keyRow}>
              {row.map((num, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.keyButton}
                  onPress={() => handleKeyPress(num)}>
                  <Text style={styles.keyText}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </PopupModal>

      {!isPasswordRequired && (
        <Tab.Navigator
          initialRouteName="IP Address"
          screenOptions={{
            tabBarStyle: {display: 'none'},
            animationEnabled: false,
          }}>
          <Tab.Screen name="IP Address" component={IpAddressScreen} />
          <Tab.Screen name="Lamp Life" component={LampLifeScreen} />
          <Tab.Screen name="Cleaning" component={CleaningScreen} />
          <Tab.Screen name="Contact" component={ContactScreen} />
        </Tab.Navigator>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  otpBox: {
    flex: 1,
    width: 70,
    height: 70,
    borderWidth: 2,
    borderColor: COLORS.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
    borderRadius: 10,
  },
  otpText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  keypad: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 16,
  },
  keyButton: {
    flex: 1,
    paddingVertical: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.gray[100],
    borderRadius: 10,
  },
  keyText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});

export default SettingsTabs;
