import React, {useRef, useEffect, memo, useMemo, useCallback} from 'react';
import {Pressable, Animated, StyleSheet} from 'react-native';
import {COLORS} from '../constants/colors';

const CustomSwitch = memo(
  ({
    value = false,
    onToggle,
    width = 90,
    height = 45,
    text = false,
    disabled = false,
  }: {
    value?: boolean;
    onToggle?: (value: boolean) => void;
    width?: number;
    height?: number;
    text?: boolean;
    disabled?: boolean;
  }) => {
    const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;

    useEffect(() => {
      Animated.spring(animatedValue, {
        toValue: value ? 1 : 0,
        useNativeDriver: true,
      }).start();
    }, [value, animatedValue]);

    const handlePress = useCallback(() => {
      if (!disabled && onToggle) {
        onToggle(!value);
      }
    }, [disabled, onToggle, value]);

    // Memoize computed values
    const padding = useMemo(() => height * 0.1, [height]);
    const trackerSize = useMemo(() => height - padding * 2, [height, padding]);
    const trackerTop = useMemo(() => padding, [padding]);
    const translateXStart = useMemo(() => padding, [padding]);
    const translateXEnd = useMemo(
      () => width - trackerSize - padding,
      [width, trackerSize, padding],
    );
    const translateX = useMemo(
      () =>
        animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [translateXStart, translateXEnd],
        }),
      [animatedValue, translateXStart, translateXEnd],
    );

    const getBackgroundColor = useCallback(() => {
      if (disabled) {
        return COLORS.gray[200];
      }
      return value ? COLORS.good[500] : COLORS.gray[100];
    }, [disabled, value]);

    const getTextColor = useCallback(() => {
      if (disabled) {
        return COLORS.gray[400];
      }
      if (text) {
        return value ? COLORS.gray[50] : COLORS.gray[600];
      }
      return 'transparent';
    }, [disabled, text, value]);

    const containerOpacity = disabled ? 0.6 : 1;

    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={({pressed}) => [
          {opacity: containerOpacity},
          pressed && !disabled ? {opacity: 0.7} : null,
        ]}>
        <Animated.View
          style={[
            styles.switchContainer,
            {
              width,
              height,
              borderRadius: height / 2,
              backgroundColor: getBackgroundColor(),
              paddingHorizontal: padding,
            },
          ]}>
          {/* ON / OFF Text inside the Track */}
          {/* Conditionally render text based on prop and ensure it fits */}
          {text && width > 60 && (
            <Animated.Text
              style={[
                styles.trackText,
                {
                  color: getTextColor(),
                  fontSize: height * 0.4,
                },
              ]}
              numberOfLines={1}>
              {value ? 'ON' : 'OFF'}
            </Animated.Text>
          )}

          {/* Animated Tracker */}
          <Animated.View
            style={[
              styles.tracker,
              {
                width: trackerSize,
                height: trackerSize,
                borderRadius: trackerSize / 2,
                top: trackerTop,
                transform: [{translateX}],
                backgroundColor: disabled ? COLORS.gray[100] : 'white',
              },
            ]}
          />
        </Animated.View>
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  switchContainer: {
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  tracker: {
    position: 'absolute',

    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  trackText: {
    fontWeight: 'bold',
    textAlign: 'center',

    width: '100%',
  },
});

export default CustomSwitch;
