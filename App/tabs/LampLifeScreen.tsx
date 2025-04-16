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

// --- IMPORT NEW MODBUS FUNCTIONS ---
import {
  setLampMaxHours, // Writes UInt16 via FC06 to specific lamp HR (1, 5, 9, 13)
  readLifeHoursSetpoint,
} from '../../utils/modbus';

// Define SectionSummary type
interface SectionSummary {
  id: number;
  name: string;
  ip: string | null; // IP is crucial
  working: boolean;
}

// Lamp hours interface
interface LampHours {
  currentHours: number;
}

export const LampLifeScreen = () => {
  const {width, height} = useWindowDimensions();
  const isPortrait = height > width;

  // --- State ---
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [selectedSection, setSelectedSection] = useState<SectionSummary | null>(
    null,
  );
  const [devices, setDevices] = useState<any[]>([]);
  const [edit, setEdit] = useState(false);
  const [focusedInputId, setFocusedInputId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lampHours, setLampHours] = useState<{[deviceId: number]: LampHours}>(
    {},
  );
  const [editedMaxHours, setEditedMaxHours] = useState<{
    [deviceId: number]: string;
  }>({});
  const [modalVisible, setModalVisible] = useState(false);

  // --- Status Log Function ---
  const logStatus = useCallback((message: string, isError = false) => {
    console.log(`[Lamp Life Status] ${message}`);
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(''), isError ? 6000 : 4000);
  }, []);

  // --- Helper: Fetch All Lamp Data for Section (Sequential) ---
  const fetchAllLampDataForSection = useCallback(
    async (section: SectionSummary | null) => {
      if (!section || !section.ip) {
        setLampHours({});
        setDevices([]); // Clear devices if no section/IP
        logStatus('No section selected or section has no IP address.');
        return;
      }

      setLoading(true);
      logStatus(`Fetching data for section: ${section.name}...`);

      try {
        const devicesFromDb = await new Promise<any[]>(resolve => {
          getDevicesForSection(section.id, resolve);
        });
        setDevices(devicesFromDb || []); // Set devices state

        if (!devicesFromDb || devicesFromDb.length === 0) {
          logStatus(`No devices found for section ${section.name}.`);
          setLampHours({});
          setLoading(false);
          return;
        }

        const fetchedHours: {[deviceId: number]: LampHours} = {};
        const deviceIds = devicesFromDb.map(d => d.id).sort((a, b) => a - b); // Process in order

        logStatus(`Reading shared max hours for section...`);

        let sharedMaxHours: number | null = null;
        try {
          sharedMaxHours = await readLifeHoursSetpoint(section.ip, 502);
          logStatus(`Shared max hours fetched successfully: ${sharedMaxHours}`);
        } catch (error: any) {
          logStatus(
            `Failed to fetch shared max hours: ${
              error.message || String(error)
            }`,
            true,
          );
        }

        if (sharedMaxHours !== null) {
          for (const deviceId of deviceIds) {
            const lampIndex = deviceId; // Assuming device ID maps directly to lamp index (1-4)
            if (lampIndex < 1 || lampIndex > 4) {
              logStatus(`Skipping device ID ${deviceId} - invalid lamp index.`);
              continue; // Skip if ID is not a valid lamp index
            }
            fetchedHours[deviceId] = {currentHours: sharedMaxHours};
          }
        } else {
          logStatus('Shared max hours not available. Defaulting to 0.', true);
          for (const deviceId of deviceIds) {
            fetchedHours[deviceId] = {currentHours: 0};
          }
        }

        setLampHours(fetchedHours);
        logStatus('Finished fetching lamp data.');
      } catch (dbError: any) {
        logStatus(`Database error fetching devices: ${dbError.message}`, true);
        setDevices([]);
        setLampHours({});
      } finally {
        setLoading(false);
      }
    },
    [logStatus], // Dependencies
  );

  // --- Fetch Sections List ---
  useEffect(() => {
    setLoading(true);
    getSectionsWithStatus(fetchedSections => {
      const formattedSections = fetchedSections
        .filter(section => !!section.ip) // Only include sections with an IP
        .map(section => ({
          id: section.id!,
          name: section.name,
          ip: section.ip,
          working: section.working,
        }));
      setSections(formattedSections);

      // Select the first section automatically if available
      if (formattedSections.length > 0) {
        setSelectedSection(formattedSections[0]);
      } else {
        setSelectedSection(null); // No sections available
        logStatus('No sections with IP addresses found.', true);
      }
      setLoading(false);
    });
  }, [logStatus]);

  // --- Fetch Lamp Data when Selected Section Changes ---
  useEffect(() => {
    fetchAllLampDataForSection(selectedSection);
    setEdit(false); // Exit edit mode when section changes
    setEditedMaxHours({}); // Clear edits when section changes
  }, [selectedSection, fetchAllLampDataForSection]);

  // --- Edit Mode Handling ---
  const handleEdit = () => {
    // Initialize based on the first available lamp or a default
    const firstLampId = devices.find(d => d.id >= 1 && d.id <= 4)?.id;
    const initialValue = firstLampId
      ? lampHours[firstLampId]?.currentHours ?? 0
      : 0;

    const initialEdits: {[deviceId: number]: string} = {};
    // Apply the same initial value to all potential lamps (1-4)
    devices.forEach(device => {
      if (device.id >= 1 && device.id <= 4) {
        initialEdits[device.id] = initialValue.toString();
      }
    });

    setEditedMaxHours(initialEdits);
    setEdit(true);
  };

  const handleCancel = () => {
    setEditedMaxHours({}); // Clear pending edits
    setEdit(false);
    logStatus('Changes cancelled.');
  };

  // --- Handle Input Change during Edit (Sync all inputs) ---
  const handleInputChange = (deviceId: number, text: string) => {
    const numericText = text.replace(/[^0-9.]/g, '');
    // Update the value for ALL lamps currently being displayed
    setEditedMaxHours(prev => {
      const newState = {...prev};
      devices.forEach(device => {
        if (device.id >= 1 && device.id <= 4) {
          newState[device.id] = numericText;
        }
      });
      return newState;
    });
  };

  // --- Execute Save Changes (Small Adjustment) ---
  const executeSaveChanges = async () => {
    setModalVisible(false); // Close modal first
    if (!selectedSection || !selectedSection.ip) {
      logStatus('Cannot save: No section selected or section has no IP.', true);
      return;
    }

    setLoading(true);
    logStatus('Saving shared max hours...');
    const sectionIp = selectedSection.ip;
    let writeError = false;

    // Get the first device ID key from editedMaxHours/lampHours
    const firstEditedKey = Object.keys(editedMaxHours)[0];
    const firstLampKey = Object.keys(lampHours)[0];

    // Ensure keys exist before parsing and accessing
    const editedValueStr = firstEditedKey
      ? editedMaxHours[parseInt(firstEditedKey, 10)]
      : '0';
    const originalMax = firstLampKey
      ? lampHours[parseInt(firstLampKey, 10)]?.currentHours
      : undefined;

    const editedValueNum = parseInt(editedValueStr, 10);

    // Check if the value is valid and different from original
    if (
      !isNaN(editedValueNum) &&
      editedValueNum >= 0 &&
      editedValueNum <= 65535 &&
      editedValueNum !== originalMax
    ) {
      try {
        // Call setLampMaxHours ONCE with the shared value.
        // The lampIndex argument is ignored by the function now, but pass 1 for compatibility.
        await setLampMaxHours(sectionIp, 502, editedValueNum, logStatus);
      } catch (error) {
        const errorMsg = `Write failed for Shared Max Hours: ${
          error instanceof Error ? error.message : String(error)
        }`;
        logStatus(errorMsg, true);
        writeError = true;
      }
    } else if (editedValueNum === originalMax) {
      logStatus('No changes detected in max hours.');
    } else {
      logStatus(
        `Invalid value entered: ${editedValueStr}. Save cancelled.`,
        true,
      );
      writeError = true; // Treat invalid input as an error for refresh logic
    }

    logStatus(
      writeError ? 'Save completed with error(s).' : 'Save successful.',
      writeError,
    );

    setLoading(false);

    // Refresh data only if there were NO errors
    if (!writeError) {
      fetchAllLampDataForSection(selectedSection);
    }
    setEdit(false); // Exit edit mode regardless
  };

  // --- Handle Confirmation (Checks for changes, opens modal) ---
  const handleConfirmChanges = () => {
    let changesMade = false;
    for (const deviceIdStr in editedMaxHours) {
      const deviceId = parseInt(deviceIdStr, 10);
      const originalMax = lampHours[deviceId]?.currentHours || 0;
      const editedValueStr = editedMaxHours[deviceId];
      const editedValueNum = parseInt(editedValueStr, 10);
      if (
        !isNaN(editedValueNum) &&
        editedValueNum >= 0 &&
        editedValueNum !== originalMax
      ) {
        changesMade = true;
        break; // Found a change, no need to check further
      }
    }

    if (!changesMade) {
      logStatus('No changes to save.');
      setEdit(false); // Exit edit mode if no changes
      return;
    }

    // If changes were detected, show the modal
    setModalVisible(true);
  };

  // --- Render Functions ---

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
    const deviceId = item.id;
    const isMonitoredLamp = deviceId >= 1 && deviceId <= 4;

    const hours = lampHours[deviceId] || {currentHours: 0};
    const editedValueStr = editedMaxHours[deviceId];

    const displayMaxHoursStr = edit
      ? editedValueStr !== undefined
        ? editedValueStr
        : hours.currentHours !== null
        ? Math.round(hours.currentHours).toString() // Show whole number
        : '0' // Default to 0 when currentHours is null
      : hours.currentHours !== null
      ? Math.round(hours.currentHours).toString() // Show whole number
      : 'N/A'; // Display 'N/A' when not in edit mode and maxHours is null

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
              keyboardType="decimal-pad"
              onChangeText={text => {
                const numericText = text.replace(/[^0-9.]/g, ''); // Allow only numbers and a single decimal point
                if (numericText.length <= 10) {
                  handleInputChange(deviceId, numericText);
                }
              }}
              onFocus={() => setFocusedInputId(deviceId)}
              onBlur={() => setFocusedInputId(null)}
              returnKeyType="done"
            />
          </View>
        </View>
      </View>
    );
  };

  // --- Main Return JSX ---
  return (
    <Layout>
      {/* Loading Overlay (Keep for visual feedback) */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.teal[500]} />
        </View>
      )}

      {/* Status Message (Keep, styled absolutely) */}
      {statusMessage ? (
        <View style={styles.statusMessageContainer}>
          <Text style={styles.statusMessageText}>{statusMessage}</Text>
        </View>
      ) : null}

      {/* Confirmation Modal (Restored) */}
      <PopupModal
        visible={modalVisible}
        onConfirm={executeSaveChanges}
        onClose={() => {
          setModalVisible(false);
        }}
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

      {/* Original Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <CustomTabBar />
      </View>

      {/* Original Main Container */}
      <View style={styles.container}>
        {/* Left Side Scroll List */}
        <View style={styles.leftContainer}>
          <View style={styles.scrollContainer}>
            {sections.length > 0 ? (
              <FlatList
                data={sections}
                renderItem={renderScrollItem}
                keyExtractor={item => item.id.toString()}
                showsVerticalScrollIndicator={false}
                extraData={selectedSection?.id || null}
              />
            ) : !loading ? (
              <View style={styles.noSectionsContainer}>
                <Text style={styles.noSectionsText}>No sections found.</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Right Side Grid */}
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
              extraData={{
                edit,
                lampHours,
                editedMaxHours,
                focusedInputId,
                loading,
              }}
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

      {/* Original Footer with Buttons */}
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
            style={[styles.editButton, {opacity: loading ? 0.5 : 1}]}
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
