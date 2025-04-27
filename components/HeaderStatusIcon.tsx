import React, {memo} from 'react';
import {View, Pressable, Text} from 'react-native';
import {COLORS} from '../constants/colors';
import {CheckIcon} from '../icons';

const HeaderStatusIcon = memo(
  ({
    item,
    index,
    iconRef,
    onPress,
    styles,
  }: {
    item: any;
    index: number;
    iconRef: (el: View | null) => void;
    onPress: (index: number, title: string) => void;
    styles: any;
  }) => (
    <View style={styles.iconWrapper}>
      <View ref={iconRef} style={styles.statusIconContainer}>
        <Pressable
          style={({pressed}) => [styles.iconButton, pressed && {opacity: 0.7}]}
          onPress={() => onPress(index, item.title)}>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor:
                  item.errorCount > 0
                    ? COLORS.error[500]
                    : item.warningCount > 0
                    ? COLORS.warning[500]
                    : COLORS.good[500],
              },
            ]}>
            {item.errorCount > 0 ? (
              <Text style={styles.statusText}>{item.errorCount}</Text>
            ) : item.warningCount > 0 ? (
              <Text style={styles.statusText}>{item.warningCount}</Text>
            ) : (
              <CheckIcon fill="#fff" style={styles.checkIcon} />
            )}
          </View>
          <item.icon
            fill={
              item.title !== 'pressure'
                ? item.errorCount > 0
                  ? COLORS.error[500]
                  : item.warningCount > 0
                  ? COLORS.warning[500]
                  : COLORS.good[500]
                : '#fff'
            }
            stroke={
              item.title === 'pressure'
                ? item.errorCount > 0
                  ? COLORS.error[500]
                  : item.warningCount > 0
                  ? COLORS.warning[500]
                  : COLORS.good[500]
                : ''
            }
          />
        </Pressable>
      </View>
    </View>
  ),
);

export default HeaderStatusIcon;
