// TooltipContent.jsx
import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {COLORS} from '../constants/colors';
import {InfoIcon} from '../icons';

const StatusBullet = ({status}) => (
  <View
    style={[
      styles.bullet,
      {
        backgroundColor:
          status === 'error' ? COLORS.error[500] : COLORS.warning[500],
      },
    ]}
  />
);

const TooltipContent = ({type, statusSummary}) => {
  const count = statusSummary.length;

  const infoIconColor =
    count === 0
      ? COLORS.teal[500]
      : count > 0 && statusSummary.some(item => item.status === 'error')
      ? COLORS.error[500]
      : COLORS.warning[500];

  if (count === 0) {
    return (
      <View style={styles.tooltipContent}>
        <InfoIcon stroke={infoIconColor} />
        <Text style={styles.tooltipText}>All {type} systems are healthy.</Text>
      </View>
    );
  }

  return (
    <View style={styles.tooltipContent}>
      <InfoIcon stroke={infoIconColor} />
      <View style={styles.tooltipTextContainer}>
        <Text style={[styles.tooltipHeading]}>
          {count} {type} {count > 1 ? 'issues' : 'issue'} detected
        </Text>

        {statusSummary.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <StatusBullet status={item.status} />
            <Text style={styles.tooltipText}>
              {item.sectionName}: {item.message}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tooltipContent: {
    backgroundColor: '#181D27',
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  tooltipTextContainer: {
    flex: 1,
  },
  tooltipHeading: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 12,
    flex: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

export default TooltipContent;
