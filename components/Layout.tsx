import {View} from 'react-native';
import React from 'react';
import Header from './Header';

const Layout = ({children}: {children: React.ReactNode}) => {
  return (
    <View style={{flex: 1, backgroundColor: '#fff'}}>
      <Header />
      {children}
    </View>
  );
};

export default Layout;
