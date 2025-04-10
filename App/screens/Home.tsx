import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle, // Keep ViewStyle
  TextStyle, // Keep TextStyle
  FlatList,
  useWindowDimensions,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';

import Layout from '../../components/Layout';
import {COLORS} from '../../constants/colors';
import {CheckIcon2, InfoIcon} from '../../icons'; // Keep original icons
import CustomSwitch from '../../components/CustomSwitch';
import {useNavigation} from '@react-navigation/native';
import {
  // getDevicesForSection, // Removed as per previous updates
  getSectionsWithStatus,
  updateSection,
} from '../../utils/db'; // Adjust path if necessary

// Import the updated Modbus functions
import {
  toggleLamp,
  // Other updated functions...
} from '../../utils/modbus'; // Adjust path if necessary

// global.Buffer = Buffer; // Only if needed

// *** Using the FUNCTIONAL code from the previous response ***
export default function Home() {
  const navigation = useNavigation();
  const {width, height} = useWindowDimensions();
  const isPortrait = height > width;

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

  const logModbusStatus = (message: string) => {
    console.log(`[Modbus Status] ${message}`);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        await getSectionsWithStatus(sectionsData => {
          const formattedSections = sectionsData.map(section => ({
            id: section.id!,
            name: section.name,
            connected: !!section.ip,
            working: section.working,
            ip: section.ip || null,
            cleaningDays: section.cleaningDays,
          }));
          setSections(formattedSections);
          const connectedSections = formattedSections.filter(s => s.connected);
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
    const newWorkingStatus = !section.working;
    logModbusStatus(
      `Attempting to toggle ${section.name} to ${
        newWorkingStatus ? 'ON' : 'OFF'
      }...`,
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const operationTimeout = setTimeout(() => {
          reject(new Error(`Modbus toggleLamp timed out for ${section.name}`));
        }, 7000);
        toggleLamp(section.ip!, 502, newWorkingStatus, msg => {
          logModbusStatus(`  ${section.name}: ${msg}`);
          const isError = msg.toLowerCase().includes('error');
          const isSuccess =
            msg.toLowerCase().includes('success') ||
            msg.toLowerCase().includes('sent successfully');
          clearTimeout(operationTimeout);
          if (isError) {
            reject(new Error(msg));
          } else {
            setTimeout(resolve, 100);
          } // Resolve after send confirmation or success
        });
      });
      logModbusStatus(
        `Modbus command for ${section.name} sent. Updating database...`,
      );
      await new Promise<void>((resolve, reject) => {
        updateSection(
          section.id,
          section.name,
          section.ip!,
          section.cleaningDays,
          newWorkingStatus,
          success => {
            if (success) {
              logModbusStatus(`Database updated for ${section.name}.`);
              const updatedSections = [...sections];
              updatedSections[index].working = newWorkingStatus;
              setSections(updatedSections);
              const connected = updatedSections.filter(s => s.connected);
              setAllSectionsWorking(
                connected.length > 0 && connected.every(s => s.working),
              );
              resolve();
            } else {
              logModbusStatus(`Failed DB update for ${section.name}.`);
              reject(new Error(`DB Update Failed`));
            }
          },
        );
      });
      logModbusStatus(`Toggle complete for ${section.name}.`);
    } catch (error: any) {
      logModbusStatus(
        `Error toggling section ${section.name}: ${error.message || error}`,
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
    const modbusPromises = connectedSections.map(section => {
      return new Promise<void>(resolve => {
        const operationTimeout = setTimeout(() => {
          logModbusStatus(`Warning: Timeout toggling ${section.name}`);
          resolve();
        }, 7000);
        toggleLamp(section.ip!, 502, newStatus, msg => {
          logModbusStatus(`  ${section.name}: ${msg}`);
          clearTimeout(operationTimeout);
          resolve(); // Resolve regardless of message for toggle all
        });
      });
    });
    try {
      await Promise.all(modbusPromises);
      logModbusStatus("Modbus 'Toggle All' commands sent.");
    } catch (error) {
      logModbusStatus(`Error during Modbus Promise.all: ${error}`);
    }
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
    logModbusStatus("Database 'Toggle All' updates attempted.");
    const finalSectionsState = sections.map(section => ({
      ...section,
      working: section.connected && section.ip ? newStatus : section.working,
    }));
    setSections(finalSectionsState);
    setAllSectionsWorking(newStatus);
    logModbusStatus("'Toggle All' operation complete.");
    setLoading(false);
  };

  const renderGridItem = ({item, index}: {item: any; index: number}) => {
    // Using original status logic
    const status =
      item.cleaningDays < 7
        ? item.cleaningDays < 5 // Nested check as per original
          ? 'error'
          : 'warning'
        : 'stable';
    return (
      <TouchableOpacity
        style={[styles.gridItem, {flex: 1}]} // Original grid item style
        onPress={() => {
          if (item.connected) {
            navigation.navigate('Section', {
              // Pass params as before
              sectionId: item.id,
              sectionName: item.name,
              sectionIp: item.ip,
            });
          } else {
            logModbusStatus(
              `Cannot navigate: Section ${item.name} is disconnected.`,
            );
          }
        }}
        disabled={!item.connected || loading} // Disable if not connected or loading
      >
        {/* Use original sectionCard style helper */}
        <View style={sectionCard(status, item.connected)}>
          <View style={styles.sectionHeader}>
            {/* Use original cardText style helper */}
            <Text style={cardText(status, item.connected)}>
              {item.connected ? status : 'disconnected'}
            </Text>
            {/* Use original cardIcon style helper */}
            <View style={cardIcon(status, item.connected)}>
              {item.connected ? (
                status === 'stable' ? (
                  <CheckIcon2 fill={'#fff'} width={24} height={24} />
                ) : status === 'error' ? (
                  // Original Error Icon structure
                  <View style={styles.errorIconContainer}>
                    <View style={styles.errorIconRingLarge} />
                    <View style={styles.errorIconRingSmall} />
                    <InfoIcon stroke={COLORS.error[600]} />
                  </View>
                ) : (
                  // Warning
                  <InfoIcon stroke={'#fff'} />
                )
              ) : (
                // Disconnected
                <InfoIcon stroke={COLORS.gray[400]} />
              )}
            </View>
          </View>
          <View style={styles.sectionHeader}>
            {/* Original sectionTitle style */}
            <Text
              style={[
                styles.sectionTitle,
                !item.connected && {color: COLORS.gray[400]},
              ]}>
              {item.name}
            </Text>
            <CustomSwitch
              value={item.connected ? item.working : false}
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Sections</Text>
          {/* Original Warning/Error Count Display */}
          <View style={styles.warningContainer}>
            <View style={styles.warningBox}>
              <View style={warningDot(COLORS.warning[500])} />
              <Text style={styles.warningText}>
                {
                  sections.filter(
                    s =>
                      s.connected && s.cleaningDays < 7 && s.cleaningDays >= 5,
                  ).length
                }{' '}
                Warnings
              </Text>
            </View>
            <View style={styles.warningBox}>
              <View style={warningDot(COLORS.error[500])} />
              <Text style={styles.warningText}>
                {sections.filter(s => s.connected && s.cleaningDays < 5).length}{' '}
                Errors
              </Text>
            </View>
          </View>
        </View>

        {/* Loading Indicator - Centered Overlay */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={COLORS.gray[600]} />
          </View>
        )}

        {/* Sections Grid */}
        <FlatList
          key={isPortrait ? 'portrait' : 'landscape'}
          data={sections}
          renderItem={renderGridItem}
          keyExtractor={item => item.id.toString()}
          numColumns={isPortrait ? 2 : 4}
          columnWrapperStyle={styles.gridColumnWrapper}
          contentContainerStyle={styles.gridContentContainer}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!loading} // Disable scroll when loading
          extraData={loading}
        />

        {/* Bottom Switch */}
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

// *** Using the STYLES you provided originally for Home.tsx ***
const styles = StyleSheet.create({
  container: {
    // Original style
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 16,
    flexDirection: 'column',
    gap: 16,
  },
  header: {
    // Original style
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    // Original style
    fontSize: 40,
    fontWeight: '500',
  },
  warningContainer: {
    // Original style
    flexDirection: 'row',
    gap: 16,
  },
  warningBox: {
    // Original style
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
    // Original style
    color: COLORS.warning[700],
  },
  gridContentContainer: {
    // Original style
    gap: 16,
    paddingBottom: 80, // Added padding for bottom switch overlap
  },
  gridItem: {
    // Original style
    flex: 1,
  },
  gridColumnWrapper: {
    // Original style
    gap: 16,
    justifyContent: 'space-between',
  },
  sectionHeader: {
    // Original style
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    // Original style
    fontSize: 24,
    fontWeight: '600',
    flexShrink: 1, // Allow shrinking
    marginRight: 8, // Add gap
  },
  bottomSwitchContainer: {
    // Original style (adjusted positioning)
    position: 'absolute', // Position at the bottom
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10, // Added padding
  },
  errorIconContainer: {
    // Original style
    position: 'relative',
    width: 50, // Ensure container matches icon base size
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIconRingLarge: {
    // Original style
    borderWidth: 4,
    borderColor: COLORS.error[600],
    borderRadius: 1000,
    width: 50,
    height: 50,
    position: 'absolute',
    opacity: 0.3,
    // transform: [{translateY: '-25%'}, {translateX: '-25%'}], // Centering handled by container
  },
  errorIconRingSmall: {
    // Original style
    width: 70,
    height: 70,
    opacity: 0.1,
    position: 'absolute',
    borderRadius: 1000,
    borderWidth: 4,
    borderColor: COLORS.error[600],
    // transform: [{translateY: '-32%'}, {translateX: '-32%'}], // Centering handled by container
  },
  loadingOverlay: {
    // Added loading overlay style
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10, // Ensure it's on top
  },
  loadingText: {
    // Added loading text style (optional)
    marginTop: 10,
    fontSize: 16,
    color: COLORS.gray[700],
  },
});

// Original warningDot style helper
const warningDot = (color: string): ViewStyle => ({
  marginRight: 10,
  backgroundColor: color,
  width: 10,
  height: 10,
  borderRadius: 500,
});

// Original sectionCard style helper
const sectionCard = (status: string, connected?: boolean): ViewStyle => ({
  borderWidth: connected ? 0 : 1,
  borderColor: COLORS.gray[100],
  backgroundColor: connected
    ? status === 'stable'
      ? COLORS.good[200]
      : status === 'warning'
      ? COLORS.warning[200]
      : COLORS.error[200] // Added error color from original logic
    : '#fff', // White if disconnected
  height: 200, // Original fixed height
  justifyContent: 'space-between',
  borderRadius: 30,
  padding: 24,
});

// Original cardIcon style helper
const cardIcon = (status: string, connected: boolean): ViewStyle => ({
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: connected
    ? status === 'stable'
      ? COLORS.good[500]
      : status === 'warning'
      ? COLORS.warning[500]
      : 'transparent' // Error was transparent in original
    : COLORS.gray[100], // Disconnected color
  width: 50,
  height: 50,
  borderRadius: 1000,
});

// Original cardText style helper
const cardText = (status: string, connected: boolean): TextStyle => ({
  textTransform: 'capitalize', // Added capitalize
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: connected
    ? status === 'stable'
      ? COLORS.good[50]
      : status === 'warning'
      ? COLORS.warning[50]
      : COLORS.error[50] // Added error background from original logic
    : COLORS.gray[100], // Background for disconnected
  borderWidth: 1,
  borderColor: connected
    ? status === 'stable'
      ? COLORS.good[200]
      : status === 'warning'
      ? COLORS.warning[200]
      : COLORS.error[200] // Added error border from original logic
    : COLORS.gray[200], // Border for disconnected
  color: connected
    ? status === 'stable'
      ? COLORS.good[700]
      : status === 'warning'
      ? COLORS.warning[700]
      : COLORS.error[700] // Added error text color from original logic
    : COLORS.gray[700], // Text color for disconnected
  paddingHorizontal: 12,
  paddingVertical: 3,
  borderRadius: 1000,
  fontSize: 14, // Added font size
  fontWeight: '500', // Added font weight
});
