import React, {memo, useMemo, useCallback} from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import {COLORS} from '../constants/colors';
import {CleaningIcon, RepeatIcon} from '../icons';

interface CleaningDaysLeftProps {
  cleaningData: {
    setpoint: number | null;
    current: number | null;
    remaining: number | null;
  };
  isResetting: boolean;
  onReset: () => void;
}

const CleaningDaysLeft = memo(
  ({cleaningData, isResetting, onReset}: CleaningDaysLeftProps) => {
    const daysLeft = useMemo(() => {
      if (
        cleaningData.remaining != null &&
        cleaningData.setpoint != null &&
        cleaningData.current != null
      ) {
        return Math.floor(cleaningData.remaining / 24);
      }
      return 0;
    }, [cleaningData]);

    const handleReset = useCallback(() => {
      if (!isResetting) {
        onReset();
      }
    }, [isResetting, onReset]);

    const styleArr = [styles.iconWrapper];
    if (isResetting) {
      styleArr.push({opacity: 0.5});
    }

    return (
      <View style={styles.cleaningContainer}>
        <View style={styles.cleaningHeader}>
          <View style={styles.iconWrapper}>
            <CleaningIcon fill={'black'} width={30} height={30} />
          </View>
          <Text style={styles.cleaningTitle}>Cleaning</Text>
        </View>
        <View style={styles.cleaningFooter}>
          <View>
            <Text style={styles.daysLeft}>{daysLeft}</Text>
            <Text style={styles.daysLeftSubText}>Days Left</Text>
          </View>
          <Pressable
            style={({pressed}) => [
              ...styleArr,
              pressed && !isResetting ? {opacity: 0.7} : null,
            ]}
            onPress={handleReset}
            disabled={isResetting}>
            {isResetting ? (
              <ActivityIndicator size="small" color={COLORS.gray[600]} />
            ) : (
              <RepeatIcon />
            )}
          </Pressable>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  cleaningContainer: {
    backgroundColor: 'white',
    borderRadius: 30,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cleaningHeader: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  iconWrapper: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 1000,
    borderColor: COLORS.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  cleaningTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  cleaningFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  daysLeft: {
    fontSize: 40,
    fontWeight: '600',
  },
  daysLeftSubText: {
    fontSize: 20,
    color: COLORS.gray[600],
  },
});

export default CleaningDaysLeft;
