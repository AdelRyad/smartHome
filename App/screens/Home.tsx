import React, {useState, useEffect} from 'react';
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

export default function Home() {
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

  const logModbusStatus = (message: string) => {
    console.log(`[Modbus Status] ${message}`);
  };

  useEffect(() => {
    const fetchData = async () => {
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
    };

    fetchData();
    const unsubscribe = navigation.addListener('focus', fetchData);
    return unsubscribe;
  }, [navigation]);

  const handleToggleSwitch = async (index: number) => {
    const section = sections[index];
    if (!section.connected || !section.ip) {
      logModbusStatus(`Section ${section.name} is not connected.`);
      return;
    }
    setLoading(true);
    const desiredState = !powerStatusStore.powerStatus[section.id];
    logModbusStatus(
      `Attempting to toggle ${section.name} to ${
        desiredState ? 'ON' : 'OFF'
      }...`,
    );

    // Optimistically update the Zustand store immediately
    powerStatusStore.setPowerStatus(section.id, desiredState);

    try {
      await toggleLamp(section.ip!, 502, desiredState);
      logModbusStatus(
        `Modbus toggle command for ${section.name} sent successfully.`,
      );
      await new Promise<void>((resolve, reject) => {
        updateSection(
          section.id,
          section.name,
          section.ip!,
          section.cleaningDays,
          desiredState,
          success => {
            if (success) {
              logModbusStatus(`Database updated for ${section.name}.`);
              resolve();
            } else {
              logModbusStatus(`Failed DB update for ${section.name}.`);
              reject(new Error(`DB Update Failed`));
            }
          },
        );
      });
      logModbusStatus(`Toggle and update complete for ${section.name}.`);
    } catch (error: any) {
      logModbusStatus(
        `Error during toggle operation for ${section.name}: ${
          error.message || error
        }`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAllSections = async (newStatus: boolean) => {
    setLoading(true);
    logModbusStatus(
      `Attempting to toggle all connected sections to ${
        newStatus ? 'ON' : 'OFF'
      }...`,
    );
    const connectedSections = sections.filter(
      section => section.connected && section.ip,
    );
    if (connectedSections.length === 0) {
      logModbusStatus('No connected sections.');
      setLoading(false);
      return;
    }

    const modbusResults = await Promise.allSettled(
      connectedSections.map(section => {
        logModbusStatus(
          `Sending ${newStatus ? 'ON' : 'OFF'} command to ${section.name}...`,
        );
        return toggleLamp(section.ip!, 502, newStatus);
      }),
    );

    modbusResults.forEach((result, index) => {
      const sectionName = connectedSections[index].name;
      if (result.status === 'fulfilled') {
        logModbusStatus(`Toggle command for ${sectionName} sent successfully.`);
      } else {
        logModbusStatus(
          `Error sending toggle command for ${sectionName}: ${
            result.reason?.message || result.reason
          }`,
        );
      }
    });

    logModbusStatus(
      "Modbus 'Toggle All' commands attempt finished. Updating database entries...",
    );

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
              logModbusStatus(`Warning: Failed DB update for ${section.name}`);
            }
            resolve();
          },
        );
      });
    });
    await Promise.all(dbUpdatePromises);

    logModbusStatus(
      "Database 'Toggle All' updates attempted. Updating local state...",
    );

    const finalSectionsState = sections.map(section => ({
      ...section,
      working: section.connected && section.ip ? newStatus : section.working,
    }));
    setSections(finalSectionsState);
    setAllSectionsWorking(newStatus);
    logModbusStatus("'Toggle All' operation complete.");
    setLoading(false);
  };

  const {statusBySection} = useStatusStore();

  // Helper to get section name by id

  // Aggregate error/warning counts for each status type
  const dpsErrorCount = Object.values(statusBySection).filter(
    s => s.dps.status === 'error',
  ).length;
  const dpsWarningCount = Object.values(statusBySection).filter(
    s => s.dps.status === 'warning',
  ).length;
  const pressureErrorCount = Object.values(statusBySection).filter(
    s => s.pressureButton.status === 'error',
  ).length;
  const pressureWarningCount = Object.values(statusBySection).filter(
    s => s.pressureButton.status === 'warning',
  ).length;
  const lampErrorCount = Object.values(statusBySection).filter(s =>
    Object.values(s.lamps).some(lamp => lamp.status === 'error'),
  ).length;
  const lampWarningCount = Object.values(statusBySection).filter(s =>
    Object.values(s.lamps).some(lamp => lamp.status === 'warning'),
  ).length;
  const cleaningErrorCount = Object.values(statusBySection).filter(
    s => s.cleaning.status === 'error',
  ).length;
  const cleaningWarningCount = Object.values(statusBySection).filter(
    s => s.cleaning.status === 'warning',
  ).length;

  const errorCount =
    dpsErrorCount + pressureErrorCount + lampErrorCount + cleaningErrorCount ||
    0;
  const warningCount =
    dpsWarningCount +
      pressureWarningCount +
      lampWarningCount +
      cleaningWarningCount || 0;

  const renderGridItem = ({item, index}: {item: any; index: number}) => {
    const status = statusBySection[item.id]?.dps.status || 'stable';

    return (
      <TouchableOpacity
        style={[styles.gridItem, {flex: 1}]}
        onPress={() => {
          if (item.connected) {
            navigation.navigate('Section', {
              sectionId: item.id as number,
              sectionName: item.name as string,
              sectionIp: item.ip as string | null,
            });
            setCurrentSectionId(item.id);
          } else {
            logModbusStatus(
              `Cannot navigate: Section ${item.name} is disconnected.`,
            );
          }
        }}
        disabled={!item.connected || loading}>
        <View style={sectionCard(status, item.connected)}>
          <View style={styles.sectionHeader}>
            <Text style={cardText(status, item.connected)}>
              {item.connected ? status : 'disconnected'}
            </Text>
            <View style={cardIcon(status, item.connected)}>
              {item.connected ? (
                status === 'stable' ? (
                  <CheckIcon2 fill={'#fff'} width={24} height={24} />
                ) : status === 'error' ? (
                  <View style={styles.errorIconContainer}>
                    <View style={styles.errorIconRingLarge} />
                    <View style={styles.errorIconRingSmall} />
                    <InfoIcon stroke={COLORS.error[600]} />
                  </View>
                ) : (
                  <InfoIcon stroke={'#fff'} />
                )
              ) : (
                <InfoIcon stroke={COLORS.gray[400]} />
              )}
            </View>
          </View>
          <View style={styles.sectionHeader}>
            <Text
              style={[
                styles.sectionTitle,
                !item.connected && {color: COLORS.gray[400]},
              ]}>
              {item.name}
            </Text>
            <CustomSwitch
              value={
                item.connected
                  ? powerStatusStore.powerStatus[item.id] ?? false
                  : false
              }
              onToggle={() => handleToggleSwitch(index)}
              disabled={!item.connected || loading}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Layout>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Sections</Text>
          <View style={styles.warningContainer}>
            <View style={styles.warningBox}>
              <View style={warningDot(COLORS.warning[500])} />
              <Text style={styles.warningText}>{warningCount} Warnings</Text>
            </View>
            <View style={styles.warningBox}>
              <View style={warningDot(COLORS.error[500])} />
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
          extraData={loading}
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
}

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
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: COLORS.gray[700],
  },
});

const warningDot = (color: string): ViewStyle => ({
  marginRight: 10,
  backgroundColor: color,
  width: 10,
  height: 10,
  borderRadius: 500,
});

const sectionCard = (status: string, connected?: boolean): ViewStyle => ({
  borderWidth: connected ? 0 : 1,
  borderColor: COLORS.gray[100],
  backgroundColor: connected
    ? status === 'stable'
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

const cardIcon = (status: string, connected: boolean): ViewStyle => ({
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: connected
    ? status === 'stable'
      ? COLORS.good[500]
      : status === 'warning'
      ? COLORS.warning[500]
      : 'transparent'
    : COLORS.gray[100],
  width: 50,
  height: 50,
  borderRadius: 1000,
});

const cardText = (status: string, connected: boolean): TextStyle => ({
  textTransform: 'capitalize',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: connected
    ? status === 'stable'
      ? COLORS.good[50]
      : status === 'warning'
      ? COLORS.warning[50]
      : COLORS.error[50]
    : COLORS.gray[100],
  borderWidth: 1,
  borderColor: connected
    ? status === 'stable'
      ? COLORS.good[200]
      : status === 'warning'
      ? COLORS.warning[200]
      : COLORS.error[200]
    : COLORS.gray[200],
  color: connected
    ? status === 'stable'
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
