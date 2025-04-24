import React, {useState, useEffect, useCallback, useMemo} from 'react';
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
import {useCurrentSectionStore} from '../../utils/useCurrentSectionStore';

type RootStackParamList = {
  Home: undefined;
  Settings: undefined;
};

type SettingsScreenNavigationProp = NavigationProp<
  RootStackParamList,
  'Settings'
>;

const Tab = createMaterialTopTabNavigator();

const KeyButton = React.memo(
  ({
    num,
    onPress,
  }: {
    num: string | number;
    onPress: (key: string | number) => void;
  }) => (
    <TouchableOpacity style={styles.keyButton} onPress={() => onPress(num)}>
      <Text style={styles.keyText}>{num}</Text>
    </TouchableOpacity>
  ),
);

const OtpDigit = React.memo(({digit}: {digit: string}) => (
  <View style={styles.otpBox}>
    <Text style={styles.otpText}>{digit}</Text>
  </View>
));

const SettingsTabs = () => {
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [password, setPassword] = useState(['', '', '', '']);
  const [isModalVisible, setIsModalVisible] = useState(true);
  const {setCurrentSectionId} = useCurrentSectionStore();

  // Memoized keypad layout to prevent recreation on every render
  const keypadLayout = useMemo(
    () => [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      ['0', 'DEL'],
    ],
    [],
  );

  useEffect(() => {
    setCurrentSectionId(null);
  }, [setCurrentSectionId]);

  const handleKeyPress = useCallback((key: string | number) => {
    setPassword(prevPassword => {
      const newPassword = [...prevPassword];

      if (key === 'DEL') {
        const lastFilledIndex = newPassword.reduceRight(
          (acc, curr, index) => (curr !== '' && acc === -1 ? index : acc),
          -1,
        );

        if (lastFilledIndex >= 0) {
          newPassword[lastFilledIndex] = '';
        }
      } else {
        const firstEmptyIndex = newPassword.indexOf('');
        if (firstEmptyIndex !== -1) {
          newPassword[firstEmptyIndex] = key.toString();
        }
      }

      // Check password immediately after update
      if (newPassword.join('') === '3645') {
        setIsModalVisible(false);
        setIsPasswordRequired(false);
      }

      return newPassword;
    });
  }, []);

  const handleModalClose = useCallback(() => {
    setIsModalVisible(false);
    navigation.navigate('Home');
  }, [navigation]);

  const renderKeyRow = useCallback(
    (row: (string | number)[]) => (
      <View key={row.join('-')} style={styles.keyRow}>
        {row.map(num => (
          <KeyButton key={num} num={num} onPress={handleKeyPress} />
        ))}
      </View>
    ),
    [handleKeyPress],
  );

  return (
    <>
      <PopupModal
        hideAcitons={true}
        visible={isModalVisible}
        onClose={handleModalClose}
        title="Enter Password"
        onConfirm={() => {}}
        Icon={LockIcon}>
        <View style={styles.otpContainer}>
          {password.map((digit, index) => (
            <OtpDigit key={index} digit={digit} />
          ))}
        </View>
        <View style={styles.keypad}>{keypadLayout.map(renderKeyRow)}</View>
      </PopupModal>

      {!isPasswordRequired && (
        <Tab.Navigator
          initialRouteName="IP Address"
          screenOptions={{
            tabBarStyle: {display: 'none'},
            animationEnabled: false,
            lazy: true, // Enable lazy loading of tabs
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

// Memoize styles to prevent recreation on every render
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

export default React.memo(SettingsTabs);
