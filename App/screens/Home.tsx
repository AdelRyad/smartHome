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
import {getSectionsWithStatus} from '../../utils/db';
import {useCurrentSectionStore} from '../../utils/useCurrentSectionStore';
import SectionCard from '../../components/SectionCard';
import WarningSummary from '../../components/WarningSummary';
import {useSectionDataStore} from '../../utils/useSectionDataStore';

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

  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const {
    sections: sectionDataMap,
    startPolling,
    stopPolling,
    cleanup,
    setSectionPowerStatus,
  } = useSectionDataStore();

  const {errorCount, warningCount} = useMemo(() => {
    let errorCount = 0;
    let warningCount = 0;
    Object.values(sectionDataMap).forEach(data => {
      if (data.dpsStatus === null || data.pressureButton === null) errorCount++;
      else if (data.dpsStatus === false || data.pressureButton === false)
        warningCount++;
    });
    return {errorCount, warningCount};
  }, [sectionDataMap]);

  useEffect(() => {
    setLoading(true);
    getSectionsWithStatus(fetchedSections => {
      const formattedSections = fetchedSections.map(section => ({
        id: section.id!,
        name: section.name,
        connected: !!section.ip,
        working: section.working,
        ip: section.ip || null,
        cleaningDays: section.cleaningDays,
      }));
      setSections(formattedSections);
      setLoading(false);
    });
    return () => {
      cleanup();
    };
  }, [cleanup]);

  useEffect(() => {
    sections.forEach(section => {
      if (section.id && section.ip) {
        startPolling(section.id, section.ip);
      }
    });
    return () => {
      sections.forEach(section => {
        if (section.id) {
          stopPolling(section.id);
        }
      });
    };
  }, [sections, startPolling, stopPolling]);

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
        await Promise.all(
          connectedSections.map(section =>
            setSectionPowerStatus(section.id, section.ip, newStatus),
          ),
        );
      } catch (error) {
        // Optionally handle error
      } finally {
        setLoading(false);
      }
    },
    [sections, setSectionPowerStatus],
  );

  const handleToggleSwitch = useCallback(
    async (index: number) => {
      setLoading(true);
      const section = sections[index];
      if (!section.connected || !section.ip) {
        setLoading(false);
        return;
      }
      const newStatus = !sectionDataMap[section.id]?.powerStatus;
      try {
        await setSectionPowerStatus(section.id, section.ip, newStatus);
      } catch (error) {
        // Optionally handle error
      } finally {
        setLoading(false);
      }
    },
    [sections, sectionDataMap, setSectionPowerStatus],
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
        powerStatus={sectionDataMap[item.id]?.powerStatus ?? false}
        onToggleSwitch={handleToggleSwitch}
        onNavigate={handleNavigate}
      />
    ),
    [loading, handleToggleSwitch, handleNavigate, sectionDataMap],
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
          extraData={[loading, sections]}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
        />

        <View style={styles.bottomSwitchContainer}>
          <CustomSwitch
            width={150}
            height={60}
            text={true}
            value={sections.every(
              s => s.connected && sectionDataMap[s.id]?.powerStatus,
            )}
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
