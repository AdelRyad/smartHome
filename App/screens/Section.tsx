import React, {useEffect, useState, useCallback} from 'react';
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

type RouteParams = {
  sectionId: string;
};

export const Section = ({}) => {
  const route = useRoute<{key: string; name: string; params: RouteParams}>();
  const {sectionId} = route.params;
  const [editLifeHours, setEditLifeHours] = useState(false);
  const [sections, setSections] = useState<
    {id: number; name: string; ip: string; cleaningDays: number}[]
  >([]);

  const {width, height} = useWindowDimensions();
  const isPortrait = height > width;

  const [devices, setDevices] = useState<any>(null);
  const [section, setSection] = useState<any>({
    id: sectionId,
  });
  const [selectedDevices, setSelectedDevices] = useState<any[]>([]);
  const [password, setPassword] = useState(['', '', '', '']);
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [modalMode, setModalMode] = useState<'resetLamp' | 'cleaning' | null>(
    null,
  );

  const [isResettingCleaningHours, setIsResettingCleaningHours] =
    useState(false);

  const useWorkingStore = useWorkingHoursStore();
  const useCleaningStore = useCleaningHoursStore();

  // Get store data for the current section
  const workingHours = useWorkingStore.workingHours[section?.id] || {};
  const cleaningData = useCleaningStore.remainingCleaningHours[section?.id] || {
    setpoint: null,
    current: null,
    remaining: null,
  };

  const logStatus = useCallback((message: string, isError = false) => {
    console.log(`[Section Screen Status] ${message}`);
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(''), isError ? 3000 : 1000);
  }, []);

  const handleKeyPress = (key: string | number) => {
    let newPassword = [...password];

    if (key === 'DEL') {
      let lastFilledIndex = -1;
      for (let i = newPassword.length - 1; i >= 0; i--) {
        if (newPassword[i] !== '') {
          lastFilledIndex = i;
          break;
        }
      }
      if (lastFilledIndex >= 0) {
        newPassword[lastFilledIndex] = '';
      }
    } else {
      const firstEmptyIndex = newPassword.findIndex(p => p === '');
      if (firstEmptyIndex !== -1) {
        newPassword[firstEmptyIndex] = key.toString();
      }
    }

    setPassword(newPassword);

    if (newPassword.join('') === '1234') {
      setIsPasswordRequired(false);
      setPassword(['', '', '', '']);
      setModalMode('resetLamp');
    }
  };

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
          logStatus(`Fetching data for ${section.name}...`);
          const devicesFromDb = await new Promise<any[] | null>(resolve => {
            getDevicesForSection(+section.id, resolve);
          });

          if (!devicesFromDb) {
            throw new Error('No devices found');
          }
          setDevices(devicesFromDb);

          logStatus('Data fetch cycle complete.');
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

  const handleResetCleaningHours = async () => {
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
  };

  const resetAllCoilsToSetpoint = async () => {
    if (!section?.ip || isResettingCleaningHours) {
      logStatus(
        isResettingCleaningHours ? 'Reset already in progress.' : 'IP Missing',
        true,
      );
      return;
    }

    setModalMode('cleaning'); // Show the confirmation modal
  };

  const executeLampReset = async () => {
    if (!section || !section.ip || selectedDevices.length === 0) {
      logStatus(
        'Cannot reset lamp hours: Section/IP missing or no lamps selected.',
        true,
      );
      setModalMode(null);
      return;
    }
    setModalMode(null);
    logStatus(
      `Resetting LIFE hours for ${selectedDevices.length} selected lamps...`,
    );

    const resetPromises = selectedDevices.map((device: {id: number}) => {
      const lampIndexToReset = device.id;
      if (lampIndexToReset >= 1 && lampIndexToReset <= 4) {
        return resetLampHours(section.ip, 502, lampIndexToReset, logStatus)
          .then(() => {
            // Update Zustand store or UI state if needed
          })
          .catch(error => {
            logStatus(
              `Reset failed for Lamp ${lampIndexToReset}: ${
                error instanceof Error ? error.message : String(error)
              }`,
              true,
            );
          });
      } else {
        return Promise.resolve();
      }
    });

    await Promise.allSettled(resetPromises);
    logStatus('Finished LIFE reset attempts.');
    setEditLifeHours(false);
    setSelectedDevices([]);
  };

  const renderScrollItem = ({
    item,
  }: {
    item: {id: number; name: string; ip: string; cleaningDays: number};
  }) => (
    <TouchableOpacity
      style={[
        styles.scrollItem,
        {
          borderLeftColor:
            item.id === section?.id ? COLORS.teal[500] : COLORS.gray[200],
        },
      ]}
      onPress={() => setSection(item)}>
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
  );

  const renderSelectedDevices = ({
    item,
  }: {
    item: {id: number; name: string};
  }) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
        <View style={styles.iconContainer}>
          {<LampIcon fill={'black'} width={26} height={26} />}
        </View>
        <Text>{item.name}</Text>
      </View>
      <TouchableOpacity
        style={{
          padding: 6,
          backgroundColor: COLORS.error[50],
          borderRadius: 50,
          width: 30,
          height: 30,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        onPress={() =>
          setSelectedDevices(
            selectedDevices.filter(
              (device: {id: number}) => device.id !== item.id,
            ),
          )
        }>
        <RemoveIcon fill={COLORS.error[600]} width={11} height={11} />
      </TouchableOpacity>
    </View>
  );

  const renderGridItem = ({
    item,
  }: {
    item: {
      id: number;
      name: string;
    };
  }) => {
    const isLampActive = item.id >= 1 && item.id <= 4;
    const hoursInfo = workingHours[item.id] || {
      currentHours: null,
      maxHours: null,
    };
    const currentHours = hoursInfo.currentHours ?? 0;
    const maxHours = hoursInfo.maxHours ?? 0;

    const remainingHours = Math.max(0, maxHours - currentHours);

    let progressBarHeight = '0%';
    let progressBarColor = COLORS.gray[200];
    if (isLampActive && hoursInfo.currentHours !== null) {
      const progress = 100 - (currentHours / maxHours) * 100;
      progressBarHeight = `${progress}%`;
      progressBarColor = COLORS.error[600];
      if (progress >= 75) {
        progressBarColor = COLORS.good[700];
      } else if (progress >= 50) {
        progressBarColor = COLORS.warning[500];
      }
    }

    return (
      <TouchableOpacity
        onLongPress={
          isLampActive
            ? () => {
                setEditLifeHours(true);
                setSelectedDevices([item]);
              }
            : undefined
        }
        onPress={
          editLifeHours && isLampActive
            ? () => {
                const isSelected = selectedDevices.some(d => d.id === item.id);
                if (isSelected) {
                  setSelectedDevices(prev =>
                    prev.filter(d => d.id !== item.id),
                  );
                } else {
                  setSelectedDevices(prev => [...prev, item]);
                }
              }
            : undefined
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
                    selectedDevices.some(d => d.id === item.id) &&
                      styles.selectedCheckbox,
                  ]}>
                  {selectedDevices.some(d => d.id === item.id) && (
                    <CheckIcon3 />
                  )}
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
                    {remainingHours} Hours
                  </Text>
                  <Text
                    style={{
                      fontSize: 16,
                      color: COLORS.gray[600],
                      fontWeight: '500',
                    }}>
                    Left
                  </Text>
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
                    height: progressBarHeight,
                    backgroundColor: progressBarColor,
                  } as any,
                ]}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Layout>
      {statusMessage ? (
        <View
          style={{
            position: 'absolute',
            bottom: 20,
            left: 20,
            right: 20,
            backgroundColor: COLORS.gray[800],
            padding: 16,
            borderRadius: 8,
            zIndex: 100,
          }}>
          <Text style={{color: 'white', textAlign: 'center'}}>
            {statusMessage}
          </Text>
        </View>
      ) : null}

      <PopupModal
        hideAcitons={true}
        visible={isPasswordRequired}
        onClose={() => {
          setIsPasswordRequired(false);
        }}
        title="Enter Password"
        onConfirm={() => {}}
        Icon={LockIcon}>
        <View style={styles.otpContainer}>
          {password.map((digit, index) => (
            <View key={index} style={styles.otpBox}>
              <Text style={styles.otpText}>{digit}</Text>
            </View>
          ))}
        </View>
        <View style={styles.keypad}>
          {[
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
            ['0', 'DEL'],
          ].map((row, rowIndex) => (
            <View key={rowIndex} style={styles.keyRow}>
              {row.map((num, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.keyButton}
                  onPress={() => handleKeyPress(num)}>
                  <Text style={styles.keyText}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </PopupModal>

      <PopupModal
        visible={modalMode !== null}
        onConfirm={() => {
          if (modalMode === 'cleaning') {
            handleResetCleaningHours();
          } else if (modalMode === 'resetLamp') {
            executeLampReset();
          }
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
              keyExtractor={item => item.id.toString()}
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
                keyExtractor={item => item.id.toString()}
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
            keyExtractor={(item, index) =>
              item?.id?.toString() ?? `fallback-key-${index}`
            }
            columnWrapperStyle={isPortrait ? null : styles.gridColumnWrapper}
            contentContainerStyle={styles.gridContentContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                <Text>
                  {devices === null ? 'Loading...' : 'No Devices Found'}
                </Text>
              </View>
            }
            extraData={{
              editLifeHours,
              selectedDevices,
            }}
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

export default Section;
