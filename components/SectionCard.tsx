import React, {memo, useMemo} from 'react';
import {
  View,
  Pressable,
  Text,
  ViewStyle,
  StyleSheet,
  TextStyle,
} from 'react-native';
import {COLORS} from '../constants/colors';
import {StatusLevel, useStatusStore} from '../utils/statusStore';
import CustomSwitch from './CustomSwitch';
import {InfoIcon, CheckIcon2} from '../icons';

const StatusIcon = memo(
  ({status, connected}: {status: StatusLevel; connected: boolean}) => {
    if (!connected) {
      return <InfoIcon stroke={COLORS.gray[400]} />;
    }

    switch (status) {
      case 'good':
        return <CheckIcon2 fill={'#fff'} width={24} height={24} />;
      case 'error':
        return (
          <View style={styles.errorIconContainer}>
            <View style={styles.errorIconRingLarge} />
            <View style={styles.errorIconRingSmall} />
            <InfoIcon stroke={COLORS.error[600]} />
          </View>
        );
      default:
        return <InfoIcon stroke={'#fff'} />;
    }
  },
);

const SectionCard = memo(
  ({
    item,
    index,
    loading,
    powerStatus,
    onToggleSwitch,
    onNavigate,
  }: {
    item: any;
    index: number;
    loading: boolean;
    powerStatus: boolean;
    onToggleSwitch: (index: number) => void;
    onNavigate: (item: any) => void;
  }) => {
    const statusStore = useStatusStore();
    const sectionStatuses = useMemo(
      () => ({
        dps: statusStore
          .getSectionStatusSummary('dps')
          .find(s => s.sectionId === item.id),
        pressure: statusStore
          .getSectionStatusSummary('pressure')
          .find(s => s.sectionId === item.id),
        cleaning: statusStore
          .getSectionStatusSummary('cleaning')
          .find(s => s.sectionId === item.id),
        lamp: statusStore
          .getSectionStatusSummary('lamp')
          .find(s => s.sectionId === item.id),
      }),
      [statusStore, item.id],
    );

    const status = useMemo(() => {
      const statuses: StatusLevel[] = [
        sectionStatuses.dps?.status,
        sectionStatuses.pressure?.status,
        sectionStatuses.cleaning?.status,
        sectionStatuses.lamp?.status,
      ].filter(Boolean) as StatusLevel[];

      if (statuses.includes('error')) {
        return 'error';
      }
      if (statuses.includes('warning')) {
        return 'warning';
      }
      return 'good';
    }, [sectionStatuses]);

    const connected = item.connected;

    // --- New logic for connection failure ---
    const sectionErrors = statusStore.getErrorsForSection(item.id);
    const connectionError = sectionErrors.find(e => e.type === 'connection');
    const pollingStopped = !!connectionError;
    const canNavigate = connected && !pollingStopped && !loading;

    const handleReconnect = () => {
      if (item.ip) {
        statusStore.reconnectSection(item.id, item.ip);
      }
    };
    // ---

    return (
      <View style={styles.gridItemContainer}>
        <Pressable
          style={({pressed}) => [
            sectionCard(status, connected),
            pressed && {opacity: 0.7},
          ]}
          onPress={() => canNavigate && onNavigate(item)}
          disabled={!canNavigate}>
          <View style={styles.sectionHeader}>
            <Text style={cardText(status, connected)}>
              {connected ? status : 'disconnected'}
            </Text>
            <View style={cardIcon(status, connected)}>
              <StatusIcon status={status} connected={connected} />
            </View>
          </View>
          {connectionError && item.ip && (
            <View style={styles.reconnectContainer}>
              <Text style={styles.reconnectErrorText}>
                {connectionError.message}
              </Text>
            </View>
          )}
          <View style={styles.sectionHeader}>
            <Text
              style={[
                styles.sectionTitle,
                !connected && {color: COLORS.gray[400]},
              ]}>
              {item.name}
            </Text>

            {!connectionError ? (
              <CustomSwitch
                value={connected ? powerStatus : false}
                onToggle={() => onToggleSwitch(index)}
                disabled={!connected || loading}
              />
            ) : (
              <Pressable
                style={styles.reconnectButton}
                onPress={handleReconnect}>
                <Text style={styles.reconnectButtonText}>Reconnect</Text>
              </Pressable>
            )}
          </View>
          {/* Only show reconnect button if connection error exists AND section has an IP */}
        </Pressable>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 16,
    flexDirection: 'column',
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: '500',
  },
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
  gridContentContainer: {
    gap: 16,
    paddingBottom: 80,
  },
  gridItem: {
    flex: 1,
  },
  gridItemContainer: {
    flex: 1,
  },
  gridColumnWrapper: {
    gap: 16,
    justifyContent: 'space-between',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 8,
  },
  bottomSwitchContainer: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
  errorIconContainer: {
    position: 'relative',
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIconRingLarge: {
    borderWidth: 4,
    borderColor: COLORS.error[600],
    borderRadius: 1000,
    width: 50,
    height: 50,
    position: 'absolute',
    opacity: 0.3,
  },
  errorIconRingSmall: {
    width: 70,
    height: 70,
    opacity: 0.1,
    position: 'absolute',
    borderRadius: 1000,
    borderWidth: 4,
    borderColor: COLORS.error[600],
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  reconnectContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  reconnectErrorText: {
    color: COLORS.error[700],
    marginBottom: 8,
    textAlign: 'center',
  },
  reconnectButton: {
    backgroundColor: COLORS.good[500],
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  reconnectButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

const sectionCard = (status: StatusLevel, connected?: boolean): ViewStyle => ({
  borderWidth: connected ? 0 : 1,
  borderColor: COLORS.gray[100],
  backgroundColor: connected
    ? status === 'good'
      ? COLORS.good[200]
      : status === 'warning'
      ? COLORS.warning[200]
      : COLORS.error[200]
    : '#fff',
  height: 200,
  justifyContent: 'space-between',
  borderRadius: 30,
  padding: 24,
});
const cardIcon = (status: StatusLevel, connected: boolean): ViewStyle => ({
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: connected
    ? status === 'good'
      ? COLORS.good[500]
      : status === 'warning'
      ? COLORS.warning[500]
      : 'transparent'
    : COLORS.gray[100],
  width: 50,
  height: 50,
  borderRadius: 1000,
});

const cardText = (status: StatusLevel, connected: boolean): TextStyle => ({
  textTransform: 'capitalize',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: connected
    ? status === 'good'
      ? COLORS.good[50]
      : status === 'warning'
      ? COLORS.warning[50]
      : COLORS.error[50]
    : COLORS.gray[100],
  borderWidth: 1,
  borderColor: connected
    ? status === 'good'
      ? COLORS.good[200]
      : status === 'warning'
      ? COLORS.warning[200]
      : COLORS.error[200]
    : COLORS.gray[200],
  color: connected
    ? status === 'good'
      ? COLORS.good[700]
      : status === 'warning'
      ? COLORS.warning[700]
      : COLORS.error[700]
    : COLORS.gray[700],
  paddingHorizontal: 12,
  paddingVertical: 3,
  borderRadius: 1000,
  fontSize: 14,
  fontWeight: '500',
});

export default SectionCard;
