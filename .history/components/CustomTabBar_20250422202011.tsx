import React from 'react';
import {View, TouchableOpacity, Text, StyleSheet} from 'react-native';
import {COLORS} from '../constants/colors'; // Adjust the path as needed
import {useNavigationState, useNavigation} from '@react-navigation/native';
import {
  CleaningIcon,
  CustomerServiceIcon,
  IPAdressIcon,
  LampIcon,
} from '../icons';

const CustomTabBar = () => {
  const state = useNavigationState(state => state);
  const navigation = useNavigation();

  const currentTab = state.routes[state.index].name;
  const tabs = [
    {title: 'IP Address', icon: IPAdressIcon},
    {title: 'Lamp Life', icon: LampIcon},
    {
      title: 'Cleaning',
      icon: CleaningIcon,
    },
    {title: 'Contact', icon: CustomerServiceIcon},
  ];

  return (
    <View style={styles.tabContainer}>
      {tabs.map(tab => {
        return (
          <TouchableOpacity
            key={tab.title}
            onPress={() => navigation.navigate(tab.title as never)}
            style={[
              styles.tabButton,
              currentTab === tab.title && styles.activeTabButton,
            ]}>
            <tab.icon fill={'black'} style={styles.icon} />
            <Text style={styles.tabText}>{tab.title}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    backgroundColor: COLORS.gray[25],
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'transparent',
    borderRadius: 16,
    borderWidth: 0,
    borderColor: COLORS.gray[200],
  },
  activeTabButton: {
    backgroundColor: 'white',
    borderWidth: 1,
  },
  icon: {
    width: 28,
    height: 28,
  },
  tabText: {
    fontSize: 20,
    fontWeight: '500',
    color: COLORS.gray[950],
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 4,
  },
});

export default CustomTabBar;
