import React, {useState, useEffect, useCallback, useMemo, memo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
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
          <WarningSummary warningCount={warningCount} errorCount={errorCount} />
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
