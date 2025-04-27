import React, {useState, useEffect, useCallback, useMemo, memo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import Layout from '../../components/Layout';
import {COLORS} from '../../constants/colors';
import CustomSwitch from '../../components/CustomSwitch';
import {useNavigation, NavigationProp} from '@react-navigation/native';
import {getSectionsWithStatus, updateSection} from '../../utils/db';
import useSectionsPowerStatusStore from '../../utils/sectionsPowerStatusStore';
import {useStatusStore} from '../../utils/statusStore';
import {useCurrentSectionStore} from '../../utils/useCurrentSectionStore';
import SectionCard from '../../components/SectionCard';
import WarningSummary from '../../components/WarningSummary';
import modbusConnectionManager from '../../utils/modbusConnectionManager';
import useWorkingHoursStore from '../../utils/workingHoursStore';
import useCleaningHoursStore from '../../utils/cleaningHoursStore';
import useDpsPressureStore from '../../utils/dpsPressureStore';
import usePressureButtonStore from '../../utils/pressureButtonStore';

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

const Home = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

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
    return () => {
      useWorkingHoursStore.getState().cleanup();
      useCleaningHoursStore.getState().cleanup();
      useDpsPressureStore.getState().cleanup();
      usePressureButtonStore.getState().cleanup();
      useSectionsPowerStatusStore.getState().cleanup();
      modbusConnectionManager.closeAll();
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [fetchData, navigation]);

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

  const handleToggleSwitch = useCallback(
    async (index: number) => {
      setLoading(true);
      const section = sections[index];
      if (!section.connected || !section.ip) {
        setLoading(false);
        return;
      }
      const currentStatus =
        powerStatusStore.sections[section.id]?.isPowered ?? false;
      const newStatus = !currentStatus;
      try {
        // Update power status for the section
        await powerStatusStore.setPowerStatus(
          section.id,
          section.ip!,
          newStatus,
        );
        // Update database for the section
        await updateSection(
          section.id,
          section.name,
          section.ip!,
          section.cleaningDays,
          newStatus,
          (success: boolean) => {
            if (!success) {
              console.error(`Failed to update DB for section ${section.id}`);
            }
          },
        );
        // Update local state
        const finalSectionsState = sections.map((s, i) =>
          i === index ? {...s, working: newStatus} : s,
        );
        setSections(finalSectionsState);
        setAllSectionsWorking(sections.every(s => s.connected && s.working));
      } catch (error) {
        console.error('Error toggling section:', error);
        // On error, refresh section state
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

  const renderItem = useCallback(
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

  const keyExtractor = useCallback((item: any) => item.id.toString(), []);

  return (
    <Layout>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Sections</Text>
          <WarningSummary warningCount={warningCount} errorCount={errorCount} />
        </View>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.gray[600]} />
          </View>
        )}

        <FlatList
          data={sections}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={4}
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

  gridContentContainer: {
    gap: 16,
    paddingBottom: 80,
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

export default memo(Home);
