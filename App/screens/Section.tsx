import React, {useEffect, useState, useCallback} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, FlatList} from 'react-native';
import Layout from '../../components/Layout';
import {COLORS} from '../../constants/colors';
import {
  CheckIcon,
  CheckIcon2,
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
import {
  getDevicesForSection,
  getSectionsWithStatus,
  updateSection,
} from '../../utils/db';
import {setCleaningHours, setLampLife, readLampHours} from '../../utils/modbus';

type RouteParams = {
  sectionId: string;
};

type LampHours = {
  current: number;
  max: number;
};

export const Section = ({}) => {
  const route = useRoute<{key: string; name: string; params: RouteParams}>();
  const {sectionId} = route.params;
  const [editLifeHours, setEditLifeHours] = useState(false);
  const [sections, setSections] = useState<
    {id: number; name: string; ip: string; cleaningDays: number}[]
  >([]);
  const [lampHours, setLampHours] = useState<Record<number, LampHours>>({});

  const {width, height} = useWindowDimensions();
  const isPortrait = height > width;

  const [modalVisible, setModalVisible] = useState(false);
  const [resetWorkingHours, setResetWorkingHours] = useState(false);
  const [devices, setDevices] = useState<any>(null);
  const [section, setSection] = useState<any>({
    id: sectionId,
  });
  const [selectedDevices, setSelectedDevices] = useState<any>([]);
  const [password, setPassword] = useState(['', '', '', '']);
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleKeyPress = (key: string | number) => {
    let newPassword = [...password];

    if (key === 'DEL') {
      // Find the last non-empty index manually
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
      setResetWorkingHours(true);
      setIsPasswordRequired(false);
      setPassword(['', '', '', '']);
    }
  };

  useEffect(() => {
    getSectionsWithStatus(sections => {
      const formattedSections = sections.map(section => ({
        id: section.id!,
        name: section.name,
        ip: section.ip,
        cleaningDays: section.cleaningDays,
      }));
      setSections(formattedSections);

      const currentSection = formattedSections.find(
        sec => sec.id === +sectionId,
      );
      if (currentSection) {
        setSection(currentSection);
      }
    });
  }, [sectionId]);

  // Helper function for status logging
  const logStatus = useCallback((message: string) => {
    console.log(`[Section Screen Status] ${message}`);
    setStatusMessage(message);
    // Optionally clear message after delay
    // setTimeout(() => setStatusMessage(''), isError ? 6000 : 4000);
  }, []);

  useEffect(() => {
    if (section?.ip) {
      const modbus_ip = section.ip;
      const modbus_port = 502;
      let isActive = true;

      // Define fetchData INSIDE useEffect to access setLoading and logStatus
      const fetchData = async () => {
        try {
          logStatus(`Fetching devices for ${section.name}...`);
          const devicesFromDb = await new Promise<any[] | null>(resolve => {
            getDevicesForSection(+section.id, resolve);
          });

          if (!isActive || !devicesFromDb) {
            setDevices([]);
            return;
          }
          setDevices(devicesFromDb);
          logStatus(
            `Found ${devicesFromDb.length} devices. Reading lamp hours...`,
          );

          const updatedLampHours: {[key: number]: LampHours} = {};
          let allLampsReadSuccessfully = true;
          let globalMaxHours = 8000;

          for (let i = 0; i < devicesFromDb.length; i++) {
            const device = devicesFromDb[i];
            const lampIndex = device.id;
            if (lampIndex > 4) continue; // Skip devices > 4
            if (!isActive) break;

            try {
              logStatus(`Reading lamp ${lampIndex} from ${modbus_ip}...`);
              const result = await readLampHours(
                modbus_ip,
                modbus_port,
                lampIndex,
              );

              if (isActive) {
                logStatus(
                  `Success reading Lamp ${lampIndex}: ${Math.floor(
                    result.currentHours,
                  )}/${Math.floor(result.maxHours)}`,
                );
                updatedLampHours[lampIndex] = {
                  current: result.currentHours,
                  max: result.maxHours,
                };
                if (lampIndex === 1) {
                  globalMaxHours = result.maxHours; // Update fallback max
                }
              }
            } catch (error: any) {
              allLampsReadSuccessfully = false;
              logStatus(
                `Failed to read lamp ${lampIndex}: ${error.message || error}`,
              );
              if (isActive) {
                updatedLampHours[lampIndex] = {current: 0, max: globalMaxHours}; // Use fallback
              }
            }

            if (
              isActive &&
              i < devicesFromDb.length - 1 &&
              devicesFromDb[i + 1]?.id <= 4
            ) {
              const delay = 2000; // 2 second delay
              logStatus(
                `Waiting ${delay / 1000}s before reading lamp ${
                  devicesFromDb[i + 1]?.id
                }...`,
              );
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }

          if (isActive) {
            setLampHours(updatedLampHours);
            logStatus(
              allLampsReadSuccessfully
                ? 'All lamp hours loaded.'
                : 'Finished reading lamp hours, some failed.',
            );
          }
        } catch (error: any) {
          if (isActive) {
            logStatus(`Error fetching data: ${error.message}`);
            setDevices([]);
            setLampHours({});
          }
        }
      }; // End of fetchData definition

      fetchData();

      return () => {
        isActive = false;
      };
    }
  }, [section, logStatus]); // Add logStatus to dependencies

  const handleResetCleaningHours = () => {
    // Assuming setCleaningHours uses a callback
    setCleaningHours(section.ip, 502, 14, (msg: string) => {
      setStatusMessage(msg);
      setSection((prev: any) => ({
        // Added type for prev
        ...prev,
        cleaningDays: 14,
      }));
      updateSection(
        section.id,
        section.name,
        section.ip,
        14, // Update cleaningDays in DB
        section.working,
        (success: boolean) => {
          if (!success) {
            logStatus('Failed to update cleaning hours in DB');
          }
        },
      );
      setModalVisible(false);
    });
  };

  const handleResetLampLife = () => {
    selectedDevices.forEach((device: {id: number}) => {
      // Pass the status callback to setLampLife
      setLampLife(section.ip, 502, 8000, (msg: string) => {
        // Added type for msg
        setStatusMessage(msg);
        // Update local state immediately
        setLampHours(prev => ({
          ...prev,
          [device.id]: {current: 0, max: prev[device.id]?.max || 8000},
        }));
      });
    });
    setResetWorkingHours(false);
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
      cleaningDays: number;
    };
  }) => {
    const hours = lampHours[item.id] || {current: 0, max: 8000};
    const percentage = Math.min(100, (hours.current / hours.max) * 100);

    return (
      <TouchableOpacity
        onLongPress={() => {
          setEditLifeHours(true);
          setSelectedDevices([item]);
        }}
        onPress={
          editLifeHours
            ? () => {
                selectedDevices.includes(item)
                  ? setSelectedDevices(
                      selectedDevices.filter(
                        (device: {id: number}) => device.id !== item.id,
                      ),
                    )
                  : setSelectedDevices([...selectedDevices, item]);
              }
            : undefined
        }
        style={styles.gridItem}>
        <View style={styles.card}>
          <View style={styles.cardContent}>
            {!editLifeHours ? (
              <View style={styles.iconContainer}>
                {<LampIcon fill={'black'} width={24} height={24} />}
              </View>
            ) : (
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderWidth: 1,
                  borderColor: COLORS.gray[200],
                  borderRadius: 4,
                  backgroundColor: selectedDevices.includes(item)
                    ? COLORS.teal[500]
                    : 'white',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                {selectedDevices.includes(item) ? <CheckIcon3 /> : null}
              </View>
            )}
            <View style={styles.textContainer}>
              <Text style={styles.title}>{item.name}</Text>
              <View style={styles.daysLeftContainer}>
                <Text style={styles.daysLeftText}>
                  {Math.floor(hours.current)} Hours
                </Text>
                <Text style={styles.daysLeftSubText}>Left</Text>
              </View>
            </View>
          </View>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                {
                  height: `${percentage}%`,
                  backgroundColor:
                    percentage > 50
                      ? COLORS.good[600]
                      : percentage > 25
                      ? COLORS.warning[500]
                      : COLORS.error[600],
                },
              ]}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Layout>
      {/* Status message */}
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

      {/* Password Modal */}
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

      {/* Cleaning Hours Modal */}
      <PopupModal
        visible={modalVisible}
        onConfirm={handleResetCleaningHours}
        onClose={() => setModalVisible(false)}
        title="Confirmation needed"
        Icon={CheckIcon}>
        <View style={styles.modalContent}>
          <View style={styles.modalIconWrapper}>
            <CleaningIcon fill={'black'} style={styles.modalIcon} />
          </View>
          <Text style={styles.modalTitle}>Reset cleaning hours</Text>
          <Text style={styles.modalSubText}>
            Are you sure you want to reset the cleaning hours? This can't be
            undone.
          </Text>
          <View style={styles.modalDeviceInfo}>
            <Text style={styles.modalDeviceName}>{section?.name}</Text>
            <Text style={styles.modalDeviceTime}>
              {section?.cleaningDays} Days
            </Text>
          </View>
        </View>
      </PopupModal>

      {/* Lamp Life Modal */}
      <PopupModal
        visible={resetWorkingHours}
        onConfirm={handleResetLampLife}
        onClose={() => setResetWorkingHours(false)}
        title="Confirmation needed"
        Icon={CheckIcon}>
        <View style={styles.modalContent}>
          <View style={styles.modalIconWrapper}>
            <CleaningIcon fill={'black'} style={styles.modalIcon} />
          </View>
          <Text style={styles.modalTitle}>Reset lamp life</Text>
          <Text style={styles.modalSubText}>
            Are you sure you want to reset the lamp life? This can't be undone.
          </Text>
          <FlatList
            data={selectedDevices}
            keyExtractor={item => item.id.toString()}
            numColumns={3}
            columnWrapperStyle={{gap: 12}}
            renderItem={({item}) => (
              <View key={item.id} style={styles.modalDeviceInfo}>
                <Text style={styles.modalDeviceName}>{item?.name}</Text>
                <Text style={styles.modalDeviceTime}>
                  {lampHours[item.id]?.current || 0} Hours
                </Text>
              </View>
            )}></FlatList>
        </View>
      </PopupModal>

      <View style={styles.container}>
        {/* Left Side - Scrollable List */}
        {editLifeHours ? (
          <View style={styles.leftContainer}>
            <View style={styles.scrollContainer}>
              <FlatList
                data={selectedDevices}
                renderItem={renderSelectedDevices}
                keyExtractor={item => item.id.toString()}
                showsVerticalScrollIndicator={false}
              />
              <View style={{}}>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={() => setIsPasswordRequired(true)}>
                  <CheckIcon2 fill={COLORS.good[600]} width={30} height={30} />
                  <Text style={styles.buttonText}>Reset All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditLifeHours(false);
                    setSelectedDevices([]);
                  }}>
                  <CloseIcon fill={COLORS.good[600]} width={30} height={30} />
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
            </View>
            <View style={styles.cleaningContainer}>
              <View style={styles.cleaningHeader}>
                <View style={styles.iconWrapper}>
                  <CleaningIcon fill={'black'} width={30} height={30} />
                </View>
                <Text style={styles.cleaningTitle}>Cleaning</Text>
              </View>
              <View style={styles.cleaningFooter}>
                <View>
                  <Text style={styles.daysLeft}>{section?.cleaningDays}</Text>
                  <Text style={styles.daysLeftSubText}>Days left</Text>
                </View>
                <TouchableOpacity
                  style={styles.iconWrapper}
                  onPress={() => setModalVisible(true)}>
                  <RepeatIcon />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Right Side - Grid */}
        <View style={styles.gridContainer}>
          <FlatList
            key={isPortrait ? 'portrait' : 'landscape'}
            numColumns={isPortrait ? 1 : 3}
            data={devices}
            renderItem={renderGridItem}
            keyExtractor={item => item.id.toString()}
            columnWrapperStyle={isPortrait ? null : styles.gridColumnWrapper}
            contentContainerStyle={styles.gridContentContainer}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Layout>
  );
};

// Your original styles remain exactly the same
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
    padding: 24,
    borderRadius: 30,
    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
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
});

export default Section;
