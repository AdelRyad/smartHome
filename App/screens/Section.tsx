import React, {useEffect, useState, useCallback, useMemo, memo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import Layout from '../../components/Layout';
import {COLORS} from '../../constants/colors';
import {
  CheckIcon3,
  CleaningIcon,
  CloseIcon,
  LampIcon,
  LockIcon,
  RemoveIcon,
  RepeatIcon,
} from '../../icons';
import {useWindowDimensions} from 'react-native';
import PopupModal from '../../components/PopupModal';
import {useRoute} from '@react-navigation/native';
import {getDevicesForSection, getSectionsWithStatus} from '../../utils/db';
import {resetLampHours, resetCleaningHours} from '../../utils/modbus';
import useCleaningHoursStore from '../../utils/cleaningHoursStore';
import useWorkingHoursStore from '../../utils/workingHoursStore';
import {useCurrentSectionStore} from '../../utils/useCurrentSectionStore';
import {readLifeHoursSetpoint} from '../../utils/modbus';

type RouteParams = {
  sectionId: string;
};

// Memoized components
const KeyButton = memo(
  ({
    num,
    onPress,
  }: {
    num: string | number;
    onPress: (key: string | number) => void;
  }) => (
    <TouchableOpacity style={styles.keyButton} onPress={() => onPress(num)}>
      <Text style={styles.keyText}>{num}</Text>
    </TouchableOpacity>
  ),
);

const OtpDigit = memo(({digit}: {digit: string}) => (
  <View style={styles.otpBox}>
    <Text style={styles.otpText}>{digit}</Text>
  </View>
));

const GridItem = memo(
  ({
    item,
    editLifeHours,
    selectedDevices,
    workingHours,
    cleaningData,
    currentSectionId,
    onSelectDevice,
    onLongPress,
  }: {
    item: any;
    editLifeHours: boolean;
    selectedDevices: any[];
    workingHours: any;
    cleaningData: any;
    currentSectionId: number;
    onSelectDevice: (item: any) => void;
    onLongPress: (item: any) => void;
  }) => {
    const id = item.id > 6 ? item.id - (currentSectionId - 1) * 6 : item.id;
    const isLampActive = id >= 1 && id <= 4;

    const hoursInfo = workingHours[id] || {
      currentHours: null,
      maxHours: null,
    };
    console.log('Hours Info:', hoursInfo);

    const currentHours = hoursInfo.currentHours ?? 0;
    const maxHours = hoursInfo.maxHours ?? 0;
    const remainingHours = Math.floor(maxHours - currentHours);

    const progressBarHeight = useMemo(() => {
      if (!isLampActive || hoursInfo.currentHours === null) return 0;
      const progress = ((maxHours - currentHours) / maxHours) * 100;
      return progress;
    }, [isLampActive, hoursInfo.currentHours, currentHours, maxHours]);

    const progressBarColor = useMemo(() => {
      if (!isLampActive || hoursInfo.currentHours === null)
        return COLORS.gray[200];
      const progress = 100 - (currentHours / maxHours) * 100;
      if (progress >= 75) return COLORS.good[700];
      if (progress >= 50) return COLORS.warning[500];
      return COLORS.error[600];
    }, [isLampActive, hoursInfo.currentHours, currentHours, maxHours]);

    const isSelected = useMemo(
      () => selectedDevices.some(d => d.id === item.id),
      [selectedDevices, item.id],
    );
    useEffect(() => {
      const fetchLifeHours = async () => {
        try {
          const setpoint = await readLifeHoursSetpoint('192.168.1.2', 502);
          console.log('Setpoint:', setpoint);
        } catch (error) {
          console.error('Error fetching life hours setpoint:', error);
        }
      };
      fetchLifeHours();
    }, []);

    return (
      <TouchableOpacity
        onLongPress={isLampActive ? () => onLongPress(item) : undefined}
        onPress={
          editLifeHours && isLampActive ? () => onSelectDevice(item) : undefined
        }
        disabled={!isLampActive}
        style={[styles.gridItem, !isLampActive && {opacity: 0.5}]}>
        <View style={styles.card}>
          <View style={styles.cardContent}>
            <View style={styles.gridItemHeader}>
              {editLifeHours && isLampActive ? (
                <View
                  style={[
                    styles.checkbox,
                    isSelected && styles.selectedCheckbox,
                  ]}>
                  {isSelected && <CheckIcon3 />}
                </View>
              ) : (
                <View style={styles.iconContainer}>
                  <LampIcon
                    fill={isLampActive ? 'black' : COLORS.gray[400]}
                    width={24}
                    height={24}
                  />
                </View>
              )}
              <Text style={styles.gridItemTitle}>{item.name}</Text>
            </View>

            <View style={styles.textContainer}>
              {isLampActive ? (
                <View style={styles.daysLeftContainer}>
                  <Text style={styles.daysLeftText}>
                    {Math.floor(remainingHours)}
                  </Text>
                  <Text style={styles.daysLeftText}>Hours Left</Text>
                </View>
              ) : (
                <Text style={styles.disabledText}>(Not Monitored)</Text>
              )}
            </View>
          </View>

          <View style={styles.progressBarContainer}>
            {isLampActive && (
              <View
                style={[
                  styles.progressBar,
                  {
                    height: `${progressBarHeight}%`,
                    backgroundColor: progressBarColor,
                  },
                ]}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

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
  console.log('Working Hours:', workingHours);

  const cleaningData = useMemo(
    () =>
      useCleaningStore.remainingCleaningHours[section?.id] || {
        setpoint: null,
        current: null,
        remaining: null,
      },
    [useCleaningStore.remainingCleaningHours, section?.id],
  );

  // Memoized keypad layout
  const keypadLayout = useMemo(
    () => [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      ['0', 'DEL'],
    ],
    [],
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
    } catch (error: any) {
      logStatus(
        `Cleaning reset failed: ${error?.message || String(error)}`,
        true,
      );
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
    } catch (error) {
      logStatus(`Reset failed: ${error.message}`, true);
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
        .filter(section => section.ip && section.ip.trim() !== '')
        .map(section => ({
          id: section.id!,
          name: section.name,
          ip: section.ip!,
          cleaningDays: section.cleaningDays,
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

  const renderKeyRow = useCallback(
    (row: (string | number)[]) => (
      <View key={row.join('-')} style={styles.keyRow}>
        {row.map(num => (
          <KeyButton key={num} num={num} onPress={handleKeyPress} />
        ))}
      </View>
    ),
    [handleKeyPress],
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
          currentSectionId={currentSectionId}
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

      <PopupModal
        hideAcitons={true}
        visible={isPasswordRequired}
        onClose={handleModalClose}
        title="Enter Password"
        onConfirm={() => {}}
        Icon={LockIcon}>
        <View style={styles.otpContainer}>
          {password.map((digit, index) => (
            <OtpDigit key={index} digit={digit} />
          ))}
        </View>
        <View style={styles.keypad}>{keypadLayout.map(renderKeyRow)}</View>
      </PopupModal>

      <PopupModal
        visible={modalMode !== null}
        onConfirm={() => {
          if (modalMode === 'cleaning') handleResetCleaningHours();
          else if (modalMode === 'resetLamp') executeLampReset();
        }}
        onClose={() => setModalMode(null)}
        title="Confirmation needed"
        Icon={modalMode === 'cleaning' ? CleaningIcon : RepeatIcon}>
        {modalMode === 'cleaning' && (
          <View style={styles.modalContent}>
            <View style={styles.modalIconWrapper}>
              <CleaningIcon fill={'black'} style={styles.modalIcon} />
            </View>
            <Text style={styles.modalTitle}>Reset Cleaning Hours?</Text>
            <Text style={styles.modalSubText}>
              Are you sure you want to reset the cleaning run hours for all
              lamps in this section?
            </Text>
            <View style={styles.modalDeviceInfo}>
              <Text style={styles.modalDeviceName}>{section?.name}</Text>
            </View>
          </View>
        )}
        {modalMode === 'resetLamp' && (
          <View style={styles.modalContent}>
            <View style={styles.modalIconWrapper}>
              <RepeatIcon style={styles.modalIcon} />
            </View>
            <Text style={styles.modalTitle}>
              Reset Hours for Selected Lamps?
            </Text>
            <Text style={styles.modalSubText}>
              Are you sure you want to reset the run hours for the selected
              lamps? This action cannot be undone.
            </Text>
            <FlatList
              data={selectedDevices}
              renderItem={({item}) => {
                const hoursInfo = workingHours[item.id];
                return (
                  <View style={styles.modalDeviceInfo}>
                    <Text style={styles.modalDeviceName}>{item.name}</Text>
                    <Text style={styles.modalDeviceTime}>
                      {`Current: ${
                        hoursInfo?.currentHours !== null
                          ? Math.floor(hoursInfo.currentHours)
                          : 'N/A'
                      } / ${
                        hoursInfo?.maxHours ? hoursInfo.maxHours : 'N/A'
                      } hrs`}
                    </Text>
                  </View>
                );
              }}
              keyExtractor={item => item.id}
              style={styles.modalDeviceList}
            />
          </View>
        )}
      </PopupModal>

      <View style={styles.container}>
        {editLifeHours ? (
          <View style={styles.leftContainer}>
            <View style={styles.scrollContainer}>
              <FlatList
                data={selectedDevices}
                renderItem={renderSelectedDevices}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={() => (
                  <Text style={styles.selectedTitle}>Selected Lamps</Text>
                )}
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
              <View style={styles.cleaningContainer}>
                <View style={styles.cleaningHeader}>
                  <View style={styles.iconWrapper}>
                    <CleaningIcon fill={'black'} width={30} height={30} />
                  </View>
                  <Text style={styles.cleaningTitle}>Cleaning</Text>
                </View>
                <View style={styles.cleaningFooter}>
                  <View>
                    <Text style={styles.daysLeft}>
                      {cleaningData.remaining != null &&
                      cleaningData.setpoint != null &&
                      cleaningData.current != null
                        ? Math.floor(cleaningData.remaining / 24)
                        : 0}
                    </Text>
                    <Text style={styles.daysLeftSubText}>Days Left</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.iconWrapper,
                      isResettingCleaningHours && {opacity: 0.5},
                    ]}
                    onPress={resetAllCoilsToSetpoint}
                    disabled={isResettingCleaningHours}>
                    {isResettingCleaningHours ? (
                      <ActivityIndicator
                        size="small"
                        color={COLORS.gray[600]}
                      />
                    ) : (
                      <RepeatIcon />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
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
  cleaningContainer: {
    backgroundColor: 'white',
    borderRadius: 30,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  cleaningHeader: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  iconWrapper: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 1000,
    borderColor: COLORS.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  cleaningTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  cleaningFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  daysLeft: {
    fontSize: 40,
    fontWeight: '600',
  },
  daysLeftSubText: {
    fontSize: 20,
    color: COLORS.gray[600],
  },
  gridContainer: {
    flex: 1,
  },
  gridContentContainer: {
    gap: 16,
    flexGrow: 1,
  },
  gridItem: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 30,
    padding: 24,
    boxShadow: '0px 4px 24px 0px rgba(0, 0, 0, 0.05)',
    minHeight: 280,
  },
  gridColumnWrapper: {
    gap: 16,
    justifyContent: 'space-between',
    height: '50%',
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 32,
    flex: 1,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  iconContainer: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 1000,
    borderColor: COLORS.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
  },
  daysLeftContainer: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  daysLeftText: {
    fontSize: 20,
    fontWeight: '600',
  },
  progressBarContainer: {
    width: 70,
    height: '100%',
    backgroundColor: COLORS.gray[100],
    borderRadius: 14,
    justifyContent: 'flex-end',
  },
  progressBar: {
    backgroundColor: 'blue',
    borderRadius: 14,
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
  disabledText: {
    fontSize: 14,
    color: COLORS.gray[600],
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 20,
  },
  checkbox: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 4,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCheckbox: {
    backgroundColor: COLORS.teal[500],
    borderColor: COLORS.teal[500],
  },
  setpointText: {
    fontSize: 14,
    color: COLORS.gray[700],
    marginTop: 4,
  },
  modalDeviceList: {
    width: '80%',
    maxHeight: 150,
    marginTop: 10,
  },
  gridItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  gridItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray[800],
    flex: 1,
    marginLeft: 8,
  },
});

export default memo(Section);
