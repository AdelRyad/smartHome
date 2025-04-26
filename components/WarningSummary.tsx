// src/screens/Home/WarningSummary.tsx
import React, {memo} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {COLORS} from '../constants/colors';

interface WarningSummaryProps {
  warningCount: number;
  errorCount: number;
}
const WarningDot = memo(({color}: {color: string}) => (
  <View style={[styles.warningDot, {backgroundColor: color}]} />
));
const WarningSummary = ({warningCount, errorCount}: WarningSummaryProps) => {
  return (
    <View style={styles.warningContainer}>
      <View style={styles.warningBox}>
        <WarningDot color={COLORS.warning[500]} />
        <Text style={styles.warningText}>{warningCount} Warnings</Text>
      </View>
      <View style={styles.warningBox}>
        <WarningDot color={COLORS.error[500]} />
        <Text style={styles.warningText}>{errorCount} Errors</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  warningContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.error[200],
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 500,
    backgroundColor: COLORS.warning[50],
  },
  warningText: {
    color: COLORS.warning[700],
  },
  warningDot: {
    marginRight: 10,
    width: 10,
    height: 10,
    borderRadius: 500,
  },
});

export default React.memo(WarningSummary);
