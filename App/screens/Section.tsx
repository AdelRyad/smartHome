import React, {useEffect, useState, useCallback, useMemo, memo} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, FlatList} from 'react-native';
import Layout from '../../components/Layout';
import {COLORS} from '../../constants/colors';
import {CloseIcon, LampIcon, RemoveIcon, RepeatIcon} from '../../icons';
import {useWindowDimensions} from 'react-native';
import {useRoute} from '@react-navigation/native';
import {getDevicesForSection, getSectionsWithStatus} from '../../utils/db';
import {resetLampHours, resetCleaningHours} from '../../utils/modbus';
import useCleaningHoursStore from '../../utils/cleaningHoursStore';
import useWorkingHoursStore from '../../utils/workingHoursStore';
import {useCurrentSectionStore} from '../../utils/useCurrentSectionStore';
import CleaningDaysLeft from '../../components/CleaningDaysLeft';
import GridItem from '../../components/GridItem';
import PasswordModal from '../../components/PasswordModal';
import SectionResetModal from '../../components/SectionResetModal';

type RouteParams = {
  sectionId: string;
};

const Section = () => {
  const route = useRoute<{key: string; name: string; params: RouteParams}>();
  const {sectionId} = route.params;
  const {width, height} = useWindowDimensions();
  const isPortrait = height > width;

  // State management
  const [editLifeHours, setEditLifeHours] = useState(false);
  const [sections, setSections] = useState<
    {id: number; name: string; ip: string; cleaningDays: number}[]
  >([]);
  const [devices, setDevices] = useState<any>(null);
  const [section, setSection] = useState<any>({id: sectionId});
  const [selectedDevices, setSelectedDevices] = useState<any[]>([]);
  const [password, setPassword] = useState(['', '', '', '']);
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [modalMode, setModalMode] = useState<'resetLamp' | 'cleaning' | null>(
    null,
  );
  const [isResettingCleaningHours, setIsResettingCleaningHours] =
    useState(false);

  // Store hooks
  const useWorkingStore = useWorkingHoursStore();
  const useCleaningStore = useCleaningHoursStore();
  const {setCurrentSectionId, currentSectionId} = useCurrentSectionStore();

  // Derived data
  const workingHours = useMemo(
    () => useWorkingStore.workingHours[section?.id] || {},
    [useWorkingStore.workingHours, section?.id],
  );

  const cleaningData = useMemo(
    () =>
      useCleaningStore.remainingCleaningHours[section?.id] || {
        setpoint: null,
        current: null,
        remaining: null,
      },
    [useCleaningStore.remainingCleaningHours, section?.id],
  );

  // Callbacks
  const logStatus = useCallback((message: string, isError = false) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(''), isError ? 3000 : 1000);
  }, []);

  const handleKeyPress = useCallback((key: string | number) => {
    setPassword(prevPassword => {
      const newPassword = [...prevPassword];

      if (key === 'DEL') {
        const lastFilledIndex = newPassword.reduceRight(
          (acc, curr, index) => (curr !== '' && acc === -1 ? index : acc),
          -1,
        );

        if (lastFilledIndex >= 0) {
          newPassword[lastFilledIndex] = '';
        }
      } else {
        const firstEmptyIndex = newPassword.indexOf('');
        if (firstEmptyIndex !== -1) {
          newPassword[firstEmptyIndex] = key.toString();
        }
      }

      if (newPassword.join('') === '2826') {
        setIsPasswordRequired(false);
        setPassword(['', '', '', '']);
        setModalMode('resetLamp');
      }

      return newPassword;
    });
  }, []);

  const handleModalClose = useCallback(() => {
    setIsPasswordRequired(false);
  }, []);

  const handleResetCleaningHours = useCallback(async () => {
    if (!section?.ip || isResettingCleaningHours) {
      logStatus(
        isResettingCleaningHours ? 'Reset already in progress.' : 'IP Missing',
        true,
      );
      return;
    }
    setIsResettingCleaningHours(true);
    setModalMode(null);
    logStatus('Resetting section cleaning hours...');
    try {
      await resetCleaningHours(section.ip, 502, logStatus);
      logStatus('Cleaning reset command sent to PLC.');
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logStatus(`Cleaning reset failed: ${errMsg}`, true);
    } finally {
      setIsResettingCleaningHours(false);
    }
  }, [section?.ip, isResettingCleaningHours, logStatus]);

  const resetAllCoilsToSetpoint = useCallback(() => {
    if (!section?.ip || isResettingCleaningHours) {
      logStatus(
        isResettingCleaningHours ? 'Reset already in progress.' : 'IP Missing',
        true,
      );
      return;
    }
    setModalMode('cleaning');
  }, [section?.ip, isResettingCleaningHours, logStatus]);

  const executeLampReset = useCallback(async () => {
    if (!section?.ip || selectedDevices.length === 0) {
      logStatus('Cannot reset: Missing section IP or no lamps selected', true);
      setModalMode(null);
      return;
    }

    setModalMode(null);
    logStatus(`Resetting ${selectedDevices.length} lamp(s)...`);

    let successCount = 0;
    let failureCount = 0;

    try {
      await Promise.all(
        selectedDevices.map(async (device: {id: number}) => {
          if (device?.id >= 1 && device?.id <= 4) {
            try {
              await resetLampHours(section.ip, 502, device.id, logStatus);
              successCount++;
            } catch (error) {
              failureCount++;
              console.error(`Failed to reset lamp ${device.id}:`, error);
            }
          }
        }),
      );

      logStatus(
        `Reset completed: ${successCount} successful, ${failureCount} failed`,
      );
      setEditLifeHours(false);
      setSelectedDevices([]);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logStatus(`Reset failed: ${errMsg}`, true);
    }
  }, [section, selectedDevices, logStatus]);

  const handleSelectDevice = useCallback((item: any) => {
    setSelectedDevices(prev => {
      const isSelected = prev.some(d => d.id === item.id);
      return isSelected ? prev.filter(d => d.id !== item.id) : [...prev, item];
    });
  }, []);

  const handleLongPress = useCallback((item: any) => {
    setEditLifeHours(true);
    setSelectedDevices([item]);
  }, []);

  // Effects
  useEffect(() => {
    getSectionsWithStatus(fetchedSections => {
      const sectionsWithIp = fetchedSections
        .filter(s => s.ip && s.ip.trim() !== '')
        .map(s => ({
          id: s.id!,
          name: s.name,
          ip: s.ip!,
          cleaningDays: s.cleaningDays,
        }));
      setSections(sectionsWithIp);

      const currentSection = sectionsWithIp.find(sec => sec.id === +sectionId);
      if (currentSection) {
        setSection(currentSection);
      } else if (sectionsWithIp.length > 0) {
        setSection(sectionsWithIp[0]);
      } else {
        logStatus('No sections with valid IP addresses found.', true);
        setSection(null);
        setDevices([]);
      }
    });
  }, [sectionId, logStatus]);

  useEffect(() => {
    if (section?.ip) {
      const fetchData = async () => {
        try {
          const devicesFromDb = await new Promise<any[] | null>(resolve => {
            getDevicesForSection(+section.id, resolve);
          });
          setDevices(devicesFromDb || []);
        } catch (error: any) {
          logStatus(
            `Error fetching data: ${error?.message || String(error)}`,
            true,
          );
          setDevices([]);
        }
      };
      fetchData();
    } else {
      setDevices([]);
    }
  }, [section, logStatus]);

  useEffect(() => {
    return () => {
      // Cleanup pollers and connections when component unmounts
      if (section?.id) {
        useWorkingStore.cleanup();
        useCleaningStore.cleanup();
      }
      setSelectedDevices([]);
      setDevices(null);
      setSection(null);
      setStatusMessage('');
    };
  }, []);

  useEffect(() => {
    const errorHandler = (error: Error) => {
      console.error('Section component error:', error);
      logStatus(`An error occurred: ${error.message}`, true);
      // Reset component state
      setEditLifeHours(false);
      setSelectedDevices([]);
      setPassword(['', '', '', '']);
      setIsPasswordRequired(false);
      setModalMode(null);
    };

    const errorListener = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      errorHandler(error);
      errorListener?.(error, isFatal);
    });

    return () => {
      ErrorUtils.setGlobalHandler(errorListener);
    };
  }, [logStatus]);

  // Render functions
  const renderScrollItem = useCallback(
    ({item}: {item: any}) => (
      <TouchableOpacity
        style={[
          styles.scrollItem,
          {
            borderLeftColor:
              item.id === section?.id ? COLORS.teal[500] : COLORS.gray[200],
          },
        ]}
        onPress={() => {
          setSection(item);
          setCurrentSectionId(item.id);
        }}>
        <Text
          style={[
            styles.scrollItemText,
            {
              color:
                item.id === section?.id ? COLORS.teal[500] : COLORS.gray[700],
            },
          ]}>
          {item.name}
        </Text>
      </TouchableOpacity>
    ),
    [section?.id, setCurrentSectionId],
  );

  const renderSelectedDevices = useCallback(
    ({item}: {item: any}) => (
      <View style={styles.selectedDeviceContainer}>
        <View style={styles.selectedDeviceInfo}>
          <View style={styles.iconContainer}>
            <LampIcon fill={'black'} width={26} height={26} />
          </View>
          <Text>{item.name}</Text>
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() =>
            setSelectedDevices(prev =>
              prev.filter(device => device.id !== item.id),
            )
          }>
          <RemoveIcon fill={COLORS.error[600]} width={11} height={11} />
        </TouchableOpacity>
      </View>
    ),
    [],
  );

  const renderGridItem = useCallback(
    ({item}: {item: any}) => {
      // Validate item data before rendering
      if (!item?.id) {
        console.warn('Invalid grid item:', item);
        return null;
      }

      return (
        <GridItem
          key={item.id}
          item={item}
          editLifeHours={editLifeHours}
          selectedDevices={selectedDevices}
          workingHours={workingHours}
          cleaningData={cleaningData}
          currentSectionId={currentSectionId ?? -1}
          onSelectDevice={handleSelectDevice}
          onLongPress={handleLongPress}
        />
      );
    },
    [
      editLifeHours,
      selectedDevices,
      workingHours,
      cleaningData,
      currentSectionId,
      handleSelectDevice,
      handleLongPress,
    ],
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: 280, // Fixed height of grid items
      offset: 280 * Math.floor(index / (isPortrait ? 1 : 3)),
      index,
    }),
    [isPortrait],
  );

  const keyExtractor = useCallback(
    (item: any) => item?.id?.toString() ?? `fallback-key-${Math.random()}`,
    [],
  );

  return (
    <Layout>
      {statusMessage && (
        <View style={styles.statusMessageContainer}>
          <Text style={styles.statusMessageText}>{statusMessage}</Text>
        </View>
      )}

      <PasswordModal
        visible={isPasswordRequired}
        password={password}
        onClose={handleModalClose}
        onKeyPress={handleKeyPress}
        styles={styles}
      />

      <SectionResetModal
        visible={modalMode !== null}
        mode={modalMode}
        onConfirm={() => {
          if (modalMode === 'cleaning') {
            handleResetCleaningHours();
          } else if (modalMode === 'resetLamp') {
            executeLampReset();
          }
        }}
        onClose={() => setModalMode(null)}
        section={section}
        selectedDevices={selectedDevices}
        workingHours={workingHours}
      />

      <View style={styles.container}>
        {editLifeHours ? (
          <View style={styles.leftContainer}>
            <View style={styles.scrollContainer}>
              <FlatList
                data={selectedDevices}
                renderItem={renderSelectedDevices}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.selectedDevicesContent}
              />
              <View style={styles.editButtonsContainer}>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={() => setIsPasswordRequired(true)}>
                  <RepeatIcon width={30} height={30} />
                  <Text style={styles.buttonText}>Reset Selected</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditLifeHours(false);
                    setSelectedDevices([]);
                  }}>
                  <CloseIcon fill={COLORS.gray[700]} width={30} height={30} />
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.leftContainer}>
            <View style={styles.scrollContainer}>
              <FlatList
                data={sections}
                renderItem={renderScrollItem}
                keyExtractor={item => item.id.toString()}
                showsVerticalScrollIndicator={false}
              />
              <CleaningDaysLeft
                cleaningData={cleaningData}
                isResetting={isResettingCleaningHours}
                onReset={resetAllCoilsToSetpoint}
              />
            </View>
          </View>
        )}

        <View style={styles.gridContainer}>
          <FlatList
            key={isPortrait ? 'portrait' : 'landscape'}
            numColumns={isPortrait ? 1 : 3}
            data={devices ?? []}
            renderItem={renderGridItem}
            keyExtractor={keyExtractor}
            getItemLayout={getItemLayout}
            columnWrapperStyle={isPortrait ? null : styles.gridColumnWrapper}
            contentContainerStyle={styles.gridContentContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyListContainer}>
                <Text>
                  {devices === null ? 'Loading...' : 'No Devices Found'}
                </Text>
              </View>
            }
            extraData={{
              editLifeHours,
              selectedDevices,
            }}
            removeClippedSubviews={true}
            maxToRenderPerBatch={6}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            initialNumToRender={6}
            onEndReachedThreshold={0.5}
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
            }}
          />
        </View>
      </View>
    </Layout>
  );
};

const styles = StyleSheet.create({
  selectedDeviceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedDeviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  removeButton: {
    padding: 6,
    backgroundColor: COLORS.error[50],
    borderRadius: 50,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusMessageContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: COLORS.gray[800],
    padding: 16,
    borderRadius: 8,
    zIndex: 100,
  },
  statusMessageText: {
    color: 'white',
    textAlign: 'center',
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    flexDirection: 'row',
    gap: 32,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  leftContainer: {
    width: 250,
    flexDirection: 'column',
    gap: 12,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 30,
    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
  },
  scrollItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderLeftWidth: 5,
  },
  scrollItemText: {
    color: COLORS.gray[700],
    fontSize: 21,
    fontWeight: '500',
  },
  gridContainer: {
    flex: 1,
  },
  gridContentContainer: {
    gap: 16,
    flexGrow: 1,
    paddingVertical: 16,
  },
  gridColumnWrapper: {
    gap: 16,
    justifyContent: 'space-between',
    height: '50%',
  },
  cancelButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  saveButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  buttonText: {
    fontSize: 24,
    fontWeight: '600',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  otpBox: {
    flex: 1,
    width: 70,
    height: 70,
    borderWidth: 2,
    borderColor: COLORS.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
    borderRadius: 10,
  },
  otpText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  keypad: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 16,
  },
  keyButton: {
    flex: 1,
    paddingVertical: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.gray[100],
    borderRadius: 10,
  },
  keyText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  selectedTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
    color: COLORS.gray[700],
  },
  editButtonsContainer: {
    marginTop: 16,
    gap: 10,
  },
  modalContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalIconWrapper: {
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 1000,
    padding: 16,
    marginBottom: 12,
  },
  modalIcon: {
    width: 50,
    height: 50,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  modalSubText: {
    fontSize: 20,
    color: COLORS.gray[600],
    width: '60%',
    textAlign: 'center',
  },
  modalDeviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 1000,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.25,
    shadowRadius: 1,
    elevation: 1,
    marginTop: 24,
    backgroundColor: 'white',
  },
  modalDeviceName: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalDeviceTime: {
    color: COLORS.gray[600],
    fontWeight: '500',
  },
  iconContainer: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 1000,
    borderColor: COLORS.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedDevicesContent: {
    gap: 16,
  },
});

export default memo(Section);
