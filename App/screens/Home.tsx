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
import {toggleLamp} from '../../utils/modbus';
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
    const sectionStatus = useStatusStore(
      state => state.statusBySection[item.id],
    );

    const status = useMemo(() => {
      if (!sectionStatus) return 'good';

      const statuses: StatusLevel[] = [
        sectionStatus.dps.status,
        sectionStatus.pressureButton.status,
        sectionStatus.cleaning.status,
        ...Object.values(sectionStatus.lamps).map(l => l.status),
      ];

      if (statuses.includes('error')) return 'error';
      if (statuses.includes('warning')) return 'warning';
      return 'good';
    }, [sectionStatus]);

    const connected = item.connected;

    return (
      <TouchableOpacity
        style={[styles.gridItem, {flex: 1}]}
        onPress={() => onNavigate(item)}
        disabled={!connected || loading}>
        <View style={sectionCard(status, connected)}>
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
        </View>
      </TouchableOpacity>
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
  const {getSectionStatusSummary} = useStatusStore();

  const {errorCount, warningCount} = useMemo(() => {
    const dpsSummary = getSectionStatusSummary('dps');
    const lampSummary = getSectionStatusSummary('lamp');
    const pressureSummary = getSectionStatusSummary('pressure');
    const cleaningSummary = getSectionStatusSummary('cleaning');

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
  }, [getSectionStatusSummary]);

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
      const desiredState = !powerStatusStore.powerStatus[section.id];

      powerStatusStore.setPowerStatus(section.id, desiredState);

      try {
        await toggleLamp(section.ip!, 502, desiredState);

        await new Promise<void>((resolve, reject) => {
          updateSection(
            section.id,
            section.name,
            section.ip!,
            section.cleaningDays,
            desiredState,
            success => {
              if (success) {
                resolve();
              } else {
                reject(new Error('DB Update Failed'));
              }
            },
          );
        });
      } catch (error: any) {
        console.error('Error toggling switch:', error);
        powerStatusStore.setPowerStatus(section.id, !desiredState);
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

      const modbusResults = await Promise.allSettled(
        connectedSections.map(section => {
          return toggleLamp(section.ip!, 502, newStatus);
        }),
      );

      modbusResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            `Failed to toggle section ${connectedSections[index].id}:`,
            result.reason,
          );
        }
      });

      const dbUpdatePromises = connectedSections.map(section => {
        return new Promise<void>(resolve => {
          updateSection(
            section.id,
            section.name,
            section.ip!,
            section.cleaningDays,
            newStatus,
            success => {
              if (!success) {
                console.error(`Failed to update DB for section ${section.id}`);
              }
              resolve();
            },
          );
        });
      });
      await Promise.all(dbUpdatePromises);

      const finalSectionsState = sections.map(section => ({
        ...section,
        working: section.connected && section.ip ? newStatus : section.working,
      }));
      setSections(finalSectionsState);
      setAllSectionsWorking(newStatus);

      setLoading(false);
    },
    [sections],
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
        powerStatus={powerStatusStore.powerStatus[item.id] ?? false}
        onToggleSwitch={handleToggleSwitch}
        onNavigate={handleNavigate}
      />
    ),
    [loading, powerStatusStore.powerStatus, handleToggleSwitch, handleNavigate],
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
          extraData={[loading, powerStatusStore.powerStatus]}
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
