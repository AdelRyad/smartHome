import React, {memo} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {LockIcon} from '../icons';
import PopupModal from './PopupModal';

const PasswordModal = memo(
  ({
    visible,
    password,
    onClose,
    onKeyPress,
    styles,
  }: {
    visible: boolean;
    password: string[];
    onClose: () => void;
    onKeyPress: (key: string | number) => void;
    styles: any;
  }) => (
    <PopupModal
      hideAcitons={true}
      visible={visible}
      onClose={onClose}
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
                onPress={() => onKeyPress(num)}>
                <Text style={styles.keyText}>{num}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </PopupModal>
  ),
);

export default PasswordModal;
