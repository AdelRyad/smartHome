import React, {useState, useEffect, useCallback, useMemo, memo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  FlatList,
  useWindowDimensions,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Layout from '../../components/Layout';
import {COLORS} from '../../constants/colors';
import {CheckIcon2, InfoIcon} from '../../icons';
import CustomSwitch from '../../components/CustomSwitch';
import {useNavigation, NavigationProp} from '@react-navigation/native';
import {getSectionsWithStatus, updateSection} from '../../utils/db';
import useSectionsPowerStatusStore from '../../utils/sectionsPowerStatusStore';
import {useStatusStore} from '../../utils/statusStore';
import {useCurrentSectionStore} from '../../utils/useCurrentSectionStore';

type RootStackParamList = {
  Home: undefined;
  Settings: undefined;
  Section: {
    sectionId: number;
    sectionName: string;
    sectionIp: string | null;
  };
  ContactUs: undefined;
};

type StatusLevel = 'good' | 'warning' | 'error' | 'unknown';

const WarningDot = memo(({color}: {color: string}) => (
  <View style={[styles.warningDot, {backgroundColor: color}]} />
));

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
        <TouchableOpacity
          style={sectionCard(status, connected)}
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
          <View style={styles.sectionHeader}>
            <Text
              style={[
                styles.sectionTitle,
                !connected && {color: COLORS.gray[400]},
              ]}>
              {item.name}
            </Text>
            <CustomSwitch
              value={connected ? powerStatus : false}
              onToggle={() => onToggleSwitch(index)}
              disabled={!connected || loading}
            />
          </View>
          {/* Show reconnect button and error if polling stopped */}
          {pollingStopped && (
            <View style={{marginTop: 12, alignItems: 'center'}}>
              <Text
                style={{
                  color: COLORS.error[700],
                  marginBottom: 8,
                  textAlign: 'center',
                }}>
                {connectionError.message}
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: COLORS.good[500],
                  paddingHorizontal: 20,
                  paddingVertical: 8,
                  borderRadius: 20,
                }}
                onPress={handleReconnect}>
                <Text style={{color: '#fff', fontWeight: 'bold'}}>
                  Reconnect
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  },
);

const Home = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const {width, height} = useWindowDimensions();
  const isPortrait = height > width;
  const {setCurrentSectionId} = useCurrentSectionStore();

  const [sections, setSections] = useState<
    {
      ip: string | null;
      id: number;
      name: string;
      connected: boolean;
      working: boolean;
      cleaningDays: number;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [allSectionsWorking, setAllSectionsWorking] = useState(false);

  const powerStatusStore = useSectionsPowerStatusStore();
  const statusStore = useStatusStore();

  const {errorCount, warningCount} = useMemo(() => {
    const dpsSummary = statusStore.getSectionStatusSummary('dps');
    const lampSummary = statusStore.getSectionStatusSummary('lamp');
    const pressureSummary = statusStore.getSectionStatusSummary('pressure');
    const cleaningSummary = statusStore.getSectionStatusSummary('cleaning');

    return {
      errorCount: [
        ...dpsSummary,
        ...lampSummary,
        ...pressureSummary,
        ...cleaningSummary,
      ].filter(item => item.status === 'error').length,
      warningCount: [
        ...dpsSummary,
        ...lampSummary,
        ...pressureSummary,
        ...cleaningSummary,
      ].filter(item => item.status === 'warning').length,
    };
  }, [statusStore]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      await getSectionsWithStatus(async sectionsData => {
        const updatedSections = sectionsData.map(section => {
          const isConnected = !!section.ip;
          return {
            id: section.id!,
            name: section.name,
            connected: isConnected,
            working: section.working,
            ip: section.ip || null,
            cleaningDays: section.cleaningDays,
          };
        });
        setSections(updatedSections);
        const connectedSections = updatedSections.filter(s => s.connected);
        const allConnectedWorking =
          connectedSections.length > 0 &&
          connectedSections.every(s => s.working);
        setAllSectionsWorking(allConnectedWorking);
      });
    } catch (error) {
      console.error('Error fetching sections:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const unsubscribe = navigation.addListener('focus', fetchData);
    return unsubscribe;
  }, [fetchData, navigation]);

  const handleToggleSwitch = useCallback(
    async (index: number) => {
      const section = sections[index];
      if (!section.connected || !section.ip) {
        return;
      }
      setLoading(true);
      const currentStatus =
        powerStatusStore.sections[section.id]?.isPowered ?? false;
      const desiredState = !currentStatus;

      try {
        // Update power status first
        await powerStatusStore.setPowerStatus(
          section.id,
          section.ip,
          desiredState,
        );

        // Update database
        await new Promise<void>((resolve, reject) => {
          updateSection(
            section.id,
            section.name,
            section.ip!,
            section.cleaningDays,
            desiredState,
            (success: boolean) => {
              if (success) {
                resolve();
              } else {
                reject(new Error('DB Update Failed'));
              }
            },
          );
        });
      } catch (error) {
        console.error('Error toggling switch:', error);
      } finally {
        setLoading(false);
      }
    },
    [sections, powerStatusStore],
  );

  const handleToggleAllSections = useCallback(
    async (newStatus: boolean) => {
      setLoading(true);

      const connectedSections = sections.filter(
        section => section.connected && section.ip,
      );
      if (connectedSections.length === 0) {
        setLoading(false);
        return;
      }

      try {
        // Update power status for all sections
        await Promise.all(
          connectedSections.map(section =>
            powerStatusStore.setPowerStatus(section.id, section.ip!, newStatus),
          ),
        );

        // Update database for all sections
        await Promise.all(
          connectedSections.map(
            section =>
              new Promise<void>(resolve => {
                updateSection(
                  section.id,
                  section.name,
                  section.ip!,
                  section.cleaningDays,
                  newStatus,
                  (success: boolean) => {
                    if (!success) {
                      console.error(
                        `Failed to update DB for section ${section.id}`,
                      );
                    }
                    resolve();
                  },
                );
              }),
          ),
        );

        // Update local state
        const finalSectionsState = sections.map(section => ({
          ...section,
          working:
            section.connected && section.ip ? newStatus : section.working,
        }));
        setSections(finalSectionsState);
        setAllSectionsWorking(newStatus);
      } catch (error) {
        console.error('Error toggling all sections:', error);
        // On error, refresh section states
        fetchData();
      } finally {
        setLoading(false);
      }
    },
    [sections, powerStatusStore, fetchData],
  );

  const handleNavigate = useCallback(
    (item: any) => {
      if (item.connected) {
        navigation.navigate('Section', {
          sectionId: item.id as number,
          sectionName: item.name as string,
          sectionIp: item.ip as string | null,
        });
        setCurrentSectionId(item.id);
      } else {
        console.warn('Cannot navigate to disconnected section');
      }
    },
    [navigation, setCurrentSectionId],
  );

  const renderGridItem = useCallback(
    ({item, index}: {item: any; index: number}) => (
      <SectionCard
        item={item}
        index={index}
        loading={loading}
        powerStatus={powerStatusStore.sections[item.id]?.isPowered ?? false}
        onToggleSwitch={handleToggleSwitch}
        onNavigate={handleNavigate}
      />
    ),
    [loading, powerStatusStore.sections, handleToggleSwitch, handleNavigate],
  );

  return (
    <Layout>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Sections</Text>
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
        </View>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.gray[600]} />
          </View>
        )}

        <FlatList
          key={isPortrait ? 'portrait' : 'landscape'}
          data={sections}
          renderItem={renderGridItem}
          keyExtractor={item => item.id.toString()}
          numColumns={isPortrait ? 2 : 4}
          columnWrapperStyle={styles.gridColumnWrapper}
          contentContainerStyle={styles.gridContentContainer}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!loading}
          extraData={[loading, powerStatusStore.sections]}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
        />

        <View style={styles.bottomSwitchContainer}>
          <CustomSwitch
            width={150}
            height={60}
            text={true}
            value={allSectionsWorking}
            onToggle={handleToggleAllSections}
            disabled={loading || sections.filter(s => s.connected).length === 0}
          />
        </View>
      </View>
    </Layout>
  );
};

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

export default memo(Home);
