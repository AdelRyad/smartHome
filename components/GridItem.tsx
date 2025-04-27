import React, {memo, useMemo, useCallback} from 'react';
import {Pressable, View, Text, StyleSheet} from 'react-native';
import {COLORS} from '../constants/colors';
import {LampIcon, CheckIcon3} from '../icons';

interface GridItemProps {
  item: {id: number; name: string};
  editLifeHours: boolean;
  selectedDevices: {id: number; name: string}[];
  workingHours: Record<
    number,
    {currentHours: number | null; maxHours: number | null}
  >;
  cleaningData: {
    setpoint: number | null;
    current: number | null;
    remaining: number | null;
  };
  currentSectionId: number;
  onSelectDevice: (item: {id: number; name: string}) => void;
  onLongPress: (item: {id: number; name: string}) => void;
}

interface ProgressBarProps {
  height: number;
  color: string;
  style?: any;
}

const ProgressBar = React.memo(({height, color, style}: ProgressBarProps) => (
  <View
    style={[
      styles.progressBar,
      {height: `${height}%`, backgroundColor: color},
      style,
    ]}
  />
));

interface CheckboxProps {
  selected: boolean;
  style?: any;
}

const Checkbox = React.memo(({selected, style}: CheckboxProps) => (
  <View style={[styles.checkbox, selected && styles.selectedCheckbox, style]}>
    {selected && <CheckIcon3 />}
  </View>
));

const GridItem = memo(
  ({
    item,
    editLifeHours,
    selectedDevices,
    workingHours,
    cleaningData, // keep for prop compatibility, but not used
    currentSectionId,
    onSelectDevice,
    onLongPress,
  }: GridItemProps) => {
    const id = useMemo(
      () => (item.id > 6 ? item.id - (currentSectionId - 1) * 6 : item.id),
      [item.id, currentSectionId],
    );
    const isLampActive = useMemo(() => id >= 1 && id <= 4, [id]);
    const hoursInfo = useMemo(
      () => workingHours[item.id] || {currentHours: null, maxHours: null},
      [workingHours, item.id],
    );
    const currentHours = hoursInfo.currentHours ?? 0;
    const maxHours = hoursInfo.maxHours ?? 0;
    const remainingHours = useMemo(
      () => Math.floor(maxHours - currentHours),
      [maxHours, currentHours],
    );
    const progressBarHeight = useMemo(() => {
      if (!isLampActive) {
        return 0;
      }
      const progress = ((maxHours - currentHours) / maxHours) * 100;
      return progress;
    }, [isLampActive, currentHours, maxHours]);
    const progressBarColor = useMemo(() => {
      if (!isLampActive) {
        return COLORS.gray[200];
      }
      const progress = 100 - (currentHours / maxHours) * 100;
      if (progress >= 75) {
        return COLORS.good[700];
      }
      if (progress >= 50) {
        return COLORS.warning[500];
      }
      return COLORS.error[600];
    }, [isLampActive, currentHours, maxHours]);
    const isSelected = useMemo(
      () => selectedDevices.some(d => d.id === item.id),
      [selectedDevices, item.id],
    );
    const handleLongPress = useCallback(
      () => isLampActive && onLongPress(item),
      [isLampActive, onLongPress, item],
    );
    const handleSelect = useCallback(
      () => editLifeHours && isLampActive && onSelectDevice(item),
      [editLifeHours, isLampActive, onSelectDevice, item],
    );
    const styleArr = [styles.gridItem];
    if (!isLampActive) {
      styleArr.push({opacity: 0.5});
    }
    return (
      <Pressable
        onLongPress={handleLongPress}
        onPress={handleSelect}
        disabled={!isLampActive}
        style={({pressed}) =>
          [...styleArr, pressed && {opacity: 0.7}].filter(Boolean)
        }>
        <View style={styles.card}>
          <View style={styles.cardContent}>
            <View style={styles.gridItemHeader}>
              {editLifeHours && isLampActive ? (
                <Checkbox selected={isSelected} />
              ) : (
                <View style={styles.iconContainer}>
                  <LampIcon
                    fill={isLampActive ? 'black' : COLORS.gray[400]}
                    width={24}
                    height={24}
                  />
                </View>
              )}
              <Text style={styles.gridItemTitle}>{item.name}</Text>
            </View>
            <View style={styles.textContainer}>
              {isLampActive ? (
                <View style={styles.daysLeftContainer}>
                  <Text style={styles.daysLeftText}>{remainingHours}</Text>
                  <Text style={styles.daysLeftText}>Hours Left</Text>
                </View>
              ) : (
                <Text style={styles.disabledText}>(Not Monitored)</Text>
              )}
            </View>
          </View>
          <View style={styles.progressBarContainer}>
            {isLampActive && (
              <ProgressBar
                height={progressBarHeight}
                color={progressBarColor}
              />
            )}
          </View>
        </View>
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  gridItem: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 30,
    padding: 24,
    boxShadow: '0px 4px 24px 0px rgba(0, 0, 0, 0.05)',
    minHeight: 280,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 32,
    flex: 1,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  iconContainer: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 1000,
    borderColor: COLORS.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  gridItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray[800],
    flex: 1,
    marginLeft: 8,
  },
  textContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  daysLeftContainer: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  daysLeftText: {
    fontSize: 20,
    fontWeight: '600',
  },
  progressBarContainer: {
    width: 70,
    height: '100%',
    backgroundColor: COLORS.gray[100],
    borderRadius: 14,
    justifyContent: 'flex-end',
  },
  progressBar: {
    backgroundColor: 'blue',
    borderRadius: 14,
  },
  checkbox: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 4,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCheckbox: {
    backgroundColor: COLORS.teal[500],
    borderColor: COLORS.teal[500],
  },
  disabledText: {
    fontSize: 14,
    color: COLORS.gray[600],
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default GridItem;
