import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import Layout from '../../components/Layout';
import {COLORS} from '../../constants/colors';
import {
  CheckIcon,
  CheckIcon2,
  CloseIcon,
  EditIcon,
  LampIcon,
} from '../../icons';
import CustomTabBar from '../../components/CustomTabBar';
import PopupModal from '../../components/PopupModal';
import {getSectionsWithStatus, getDevicesForSection} from '../../utils/db';
import {setLampMaxHours} from '../../utils/modbus';
import {useCurrentSectionStore} from '../../utils/useCurrentSectionStore';
import useWorkingHoursStore from '../../utils/workingHoursStore';

interface SectionSummary {
  id: number;
  name: string;
  ip: string | null;
  working: boolean;
}

interface LampHours {
  currentHours: number | null;
  maxHours: number | null;
}

export const LampLifeScreen = () => {
  const {width, height} = useWindowDimensions();
  const isPortrait = height > width;
  const {workingHours} = useWorkingHoursStore();

  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [selectedSection, setSelectedSection] = useState<SectionSummary | null>(
    null,
  );
  const [devices, setDevices] = useState<any[]>([]);
  const [edit, setEdit] = useState(false);
  const [focusedInputId, setFocusedInputId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [editedMaxHours, setEditedMaxHours] = useState<{
    [deviceId: number]: string;
  }>({});
  const [modalVisible, setModalVisible] = useState(false);

  const {setCurrentSectionId} = useCurrentSectionStore();

  // Get lamp data from store for the selected section
  const getLampDataFromStore = useCallback(
    (deviceId: number): LampHours => {
      if (!selectedSection) return {currentHours: null, maxHours: null};

      const sectionData = workingHours[selectedSection.id];
      if (!sectionData) return {currentHours: null, maxHours: null};

      return sectionData[deviceId] || {currentHours: null, maxHours: null};
    },
    [workingHours, selectedSection],
  );

  // Fetch devices for section from DB
  const fetchDevicesForSection = useCallback(
    async (section: SectionSummary | null) => {
      if (!section) {
        setDevices([]);
        return;
      }

      setLoading(true);
      try {
        const devicesFromDb = await new Promise<any[]>(resolve => {
          getDevicesForSection(section.id, resolve);
        });
        setDevices(devicesFromDb || []);
      } catch (error: any) {
        setDevices([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Fetch sections list
  useEffect(() => {
    setLoading(true);
    getSectionsWithStatus(fetchedSections => {
      const formattedSections = fetchedSections
        .filter(section => !!section.ip)
        .map(section => ({
          id: section.id!,
          name: section.name,
          ip: section.ip,
          working: section.working,
        }));

      setSections(formattedSections);

      if (formattedSections.length > 0) {
        setSelectedSection(formattedSections[0]);
        setCurrentSectionId(formattedSections[0].id);
      } else {
        setSelectedSection(null);
      }
      setLoading(false);
    });
  }, [setCurrentSectionId]);

  // Fetch devices when selected section changes
  useEffect(() => {
    fetchDevicesForSection(selectedSection);
    setEdit(false);
    setEditedMaxHours({});
  }, [selectedSection, fetchDevicesForSection]);

  const handleEdit = () => {
    const initialEdits: {[deviceId: number]: string} = {};
    devices.forEach(device => {
      if (device.id >= 1 && device.id <= 4) {
        const lampData = getLampDataFromStore(device.id);
        initialEdits[device.id] = lampData.maxHours?.toString() || '0';
      }
    });
    setEditedMaxHours(initialEdits);
    setEdit(true);
  };

  const handleCancel = () => {
    setEditedMaxHours({});
    setEdit(false);
  };

  const handleInputChange = (deviceId: number, text: string) => {
    const numericText = text.replace(/[^0-9.]/g, '');
    setEditedMaxHours(prev => {
      const newState = {...prev};
      devices.forEach((device, index) => {
        console.log(`Device ID: ${device.id}, Index: ${index}`);

        if (index >= 0 && index <= 4) {
          newState[index] = numericText;
        }
      });
      return newState;
    });
  };

  const executeSaveChanges = async () => {
    setModalVisible(false);
    if (!selectedSection || !selectedSection.ip) {
      return;
    }

    setLoading(true);
    let anyChangesSaved = false;

    try {
      for (const deviceIdStr in editedMaxHours) {
        const deviceId = parseInt(deviceIdStr, 10);
        const editedValue = editedMaxHours[deviceId];
        const editedValueNum = parseInt(editedValue, 10);
        const originalMax = getLampDataFromStore(deviceId).maxHours ?? 0;

        if (!isNaN(editedValueNum) && editedValueNum !== originalMax) {
          await setLampMaxHours(selectedSection.ip, 502, editedValueNum);
          anyChangesSaved = true;
        }
      }

      if (anyChangesSaved) {
      } else {
      }
    } catch (error: any) {
    } finally {
      setLoading(false);
      setEdit(false);
    }
  };

  const handleConfirmChanges = () => {
    let changesMade = false;
    for (const deviceIdStr in editedMaxHours) {
      const deviceId = parseInt(deviceIdStr, 10);
      const originalMax = getLampDataFromStore(deviceId).maxHours ?? 0;
      const editedValueStr = editedMaxHours[deviceId];
      const editedValueNum = parseInt(editedValueStr, 10);

      if (!isNaN(editedValueNum)) {
        changesMade = true;
        break;
      }
    }

    if (!changesMade) {
      setEdit(false);
      return;
    }

    setModalVisible(true);
  };

  const renderScrollItem = ({item}: {item: SectionSummary}) => (
    <TouchableOpacity
      style={[
        styles.scrollItem,
        {
          borderLeftColor:
            item.id === selectedSection?.id
              ? COLORS.teal[500]
              : COLORS.gray[200],
        },
      ]}
      onPress={() => {
        if (item.id !== selectedSection?.id) {
          setSelectedSection(item);
          setCurrentSectionId(item.id);
          setEdit(false);
        }
      }}
      disabled={loading}>
      <Text
        style={[
          styles.scrollItemText,
          {
            color:
              item.id === selectedSection?.id
                ? COLORS.teal[500]
                : COLORS.gray[700],
          },
        ]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderGridItem = ({item}: {item: any}) => {
    const deviceId =
      item.id > 6 ? item.id - (selectedSection?.id - 1) * 6 : item.id;
    const isMonitoredLamp = deviceId >= 1 && deviceId <= 4;
    const lampData = getLampDataFromStore(deviceId);
    const editedValueStr = editedMaxHours[deviceId];

    const displayMaxHoursStr = edit
      ? editedValueStr !== undefined
        ? editedValueStr
        : lampData.maxHours !== null
        ? Math.round(lampData.maxHours).toString()
        : '0'
      : lampData.maxHours !== null
      ? Math.round(lampData.maxHours).toString()
      : 'N/A';

    return (
      <View style={styles.gridItem}>
        <View style={styles.card}>
          <View style={styles.cardContent}>
            <View style={styles.titleContainer}>
              <View style={styles.iconWrapper}>
                <LampIcon
                  fill={isMonitoredLamp ? 'black' : COLORS.gray[400]}
                  style={styles.icon}
                />
              </View>
              <Text style={styles.titleInputReadOnly}>{item.name}</Text>
            </View>

            <TextInput
              style={[
                styles.daysLeftInput,
                focusedInputId === deviceId && styles.focusedInput,
                !isMonitoredLamp && {opacity: 0.5},
              ]}
              value={displayMaxHoursStr}
              editable={edit && isMonitoredLamp && !loading}
              placeholder="Max Hrs"
              placeholderTextColor={COLORS.gray[600]}
              keyboardType="number-pad"
              onChangeText={text => handleInputChange(deviceId, text)}
              onFocus={() => setFocusedInputId(deviceId)}
              onBlur={() => setFocusedInputId(null)}
              returnKeyType="done"
            />
          </View>
        </View>
      </View>
    );
  };

  return (
    <Layout>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.teal[500]} />
        </View>
      )}

      <PopupModal
        visible={modalVisible}
        onConfirm={executeSaveChanges}
        onClose={() => setModalVisible(false)}
        title="Confirmation needed"
        Icon={CheckIcon}>
        <View style={styles.modalContent}>
          <View style={styles.modalIconWrapper}>
            <LampIcon fill={COLORS.gray[600]} width={40} height={40} />
          </View>
          <Text style={styles.modalTitle}>Update Lamp Life?</Text>
          <Text style={styles.modalSubText}>
            Are you sure you want to save the changes to the lamp life hours?
          </Text>
        </View>
      </PopupModal>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <CustomTabBar />
      </View>

      <View style={styles.container}>
        <View style={styles.leftContainer}>
          <View style={styles.scrollContainer}>
            {sections.length > 0 ? (
              <FlatList
                data={sections}
                renderItem={renderScrollItem}
                keyExtractor={item => item.id.toString()}
                showsVerticalScrollIndicator={false}
                extraData={selectedSection?.id}
              />
            ) : !loading ? (
              <View style={styles.noSectionsContainer}>
                <Text style={styles.noSectionsText}>No sections found.</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.gridContainer}>
          {selectedSection && devices.length > 0 ? (
            <FlatList
              key={isPortrait ? 'portrait-lamp' : 'landscape-lamp'}
              numColumns={isPortrait ? 1 : 3}
              data={devices}
              renderItem={renderGridItem}
              keyExtractor={item => `device-${item.id}`}
              columnWrapperStyle={isPortrait ? null : styles.gridColumnWrapper}
              contentContainerStyle={styles.gridContentContainer}
              showsVerticalScrollIndicator={false}
              extraData={{edit, editedMaxHours, focusedInputId, loading}}
            />
          ) : !loading ? (
            <View style={styles.noSectionsContainer}>
              <Text style={styles.noSectionsText}>
                {selectedSection ? 'No devices found.' : 'Select a section.'}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        {edit ? (
          <>
            <TouchableOpacity
              style={[styles.cancelButton, {opacity: loading ? 0.5 : 1}]}
              onPress={handleCancel}
              disabled={loading}>
              <CloseIcon fill={COLORS.gray[600]} width={24} height={24} />
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, {opacity: loading ? 0.5 : 1}]}
              onPress={handleConfirmChanges}
              disabled={loading}>
              <CheckIcon2 fill={COLORS.good[600]} width={30} height={30} />
              <Text style={styles.buttonText}>Save Changes</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[
              styles.editButton,
              {opacity: !selectedSection || loading ? 0.5 : 1},
            ]}
            onPress={handleEdit}
            disabled={!selectedSection || loading}>
            <EditIcon fill={COLORS.gray[600]} width={24} height={24} />
            <Text style={styles.buttonText}>Edit Lamp Life</Text>
          </TouchableOpacity>
        )}
      </View>
    </Layout>
  );
};
// --- Styles (Reverted to Original Structure) ---
const styles = StyleSheet.create({
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  statusMessageContainer: {
    position: 'absolute',
    bottom: 80,
    left: '10%',
    right: '10%',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    zIndex: 1100,
    alignItems: 'center',
  },
  statusMessageText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 40,
    fontWeight: '500',
    color: COLORS.gray[800],
  },
  container: {
    flex: 1,
    flexDirection: 'row',
    gap: 32,
    paddingLeft: 32,
    paddingRight: 32,
  },
  leftContainer: {
    width: 250,
    flexDirection: 'column',
    gap: 12,
    marginVertical: 16,
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
    paddingVertical: 16,
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
    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
    minHeight: 180,
    justifyContent: 'space-between',
  },
  gridColumnWrapper: {
    gap: 16,
    justifyContent: 'space-between',
  },
  card: {
    flex: 1,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  iconWrapper: {
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 1000,
    padding: 16,
    backgroundColor: COLORS.gray[50],
  },
  icon: {
    width: 24,
    height: 24,
  },
  titleInputReadOnly: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray[800],
    flexShrink: 1,
  },
  daysLeftInput: {
    fontSize: 20,
    fontWeight: '500',
    color: COLORS.gray[700],
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.gray[100],
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 15,
    width: '100%',
    textAlign: 'center',
  },
  focusedInput: {
    borderColor: COLORS.teal[500],
    backgroundColor: 'white',
    borderWidth: 2,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 16,
    flexDirection: 'row',
  },
  editButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: 'white',
  },
  cancelButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: 'white',
  },
  saveButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: 'white',
  },
  buttonText: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray[800],
  },
  noSectionsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.6,
  },
  noSectionsText: {
    color: COLORS.gray[600],
    fontSize: 16,
  },
  modalContent: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  modalIconWrapper: {
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 1000,
    padding: 16,
    marginBottom: 12,
    backgroundColor: COLORS.gray[50],
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray[800],
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubText: {
    fontSize: 18,
    color: COLORS.gray[600],
    width: '70%',
    textAlign: 'center',
    marginBottom: 20,
  },
  currentHoursValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.gray[800],
    textAlign: 'center',
  },
  currentHoursDisplayContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  deviceIdText: {
    fontSize: 12,
    color: COLORS.gray[600],
  },
});

export default LampLifeScreen;
