import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  useWindowDimensions, // Added useWindowDimensions back
} from 'react-native';
import Layout from '../../components/Layout';
import {COLORS} from '../../constants/colors'; // Use your colors path
import {
  CheckIcon,
  CheckIcon2,
  CloseIcon,
  EditIcon,
  LampIcon,
} from '../../icons'; // Use your icons path
import CustomTabBar from '../../components/CustomTabBar';
import PopupModal from '../../components/PopupModal';
import {
  getSectionsWithStatus,
  // updateSectionDeviceStatus, // No longer updating individual device status in DB for setpoint
  getDevicesForSection, // Keep this to display the 6 device cards
} from '../../utils/db'; // Use your DB utils path

// --- IMPORT NEW MODBUS FUNCTIONS ---
import {
  setLampLife, // Writes float32 via FC16 for the GLOBAL setpoint
  readLampHours, // Read current and max lamp hours
} from '../../utils/modbus'; // Use your modbus path

// Define SectionSummary type
interface SectionSummary {
  id: number;
  name: string;
  ip: string | null; // IP is crucial
  working: boolean;
}

// Define the LampHours interface
interface LampHours {
  current: number;
  max: number;
}

// Define Device type (matching original structure)
/*
interface Device {
  id: number;
  name: string; // Assuming 'name' instead of 'title' based on grid item render
  workingHours: number; // Keep for structure, but value might not be directly used/accurate for setpoint display
  workingStatus: boolean; // Keep if needed
  // Add other fields if they exist in getDevicesForSection result
}
*/

export const LampLifeScreen = () => {
  const {width, height} = useWindowDimensions(); // Keep for layout
  const isPortrait = height > width;

  // --- State ---
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [selectedSection, setSelectedSection] = useState<SectionSummary | null>(
    null,
  );
  const [devices, setDevices] = useState<any[]>([]); // Use any[] initially, type will be inferred
  const [currentSetpoint, setCurrentSetpoint] = useState<number | null>(null); // Holds value read from PLC
  const [newValue, setNewValue] = useState<string>(''); // Input value (string) - used for ALL devices when saving
  const [edit, setEdit] = useState(false);
  const [modalVisible, setModalVisible] = useState(false); // Confirmation modal
  const [focusedInputId, setFocusedInputId] = useState<number | null>(null); // Track focus per device card input
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lampHours, setLampHours] = useState<{[key: number]: LampHours}>({});

  // --- Status Log Function ---
  const logStatus = useCallback((message: string, isError = false) => {
    console.log(`[Lamp Life Screen Status] ${message}`);
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(''), isError ? 6000 : 4000);
  }, []);

  // --- Fetch Sections List (Only with IP) ---
  useEffect(() => {
    setLoading(true);
    getSectionsWithStatus(fetchedSections => {
      const sectionsWithIp = fetchedSections
        .filter(section => !!section.ip) // <-- FILTER: Only sections with an IP
        .map(section => ({
          id: section.id!,
          name: section.name,
          ip: section.ip,
          working: section.working,
        }));
      setSections(sectionsWithIp);
      if (sectionsWithIp.length > 0) {
        setSelectedSection(sectionsWithIp[0]); // Select first valid one
      } else {
        setSelectedSection(null);
        logStatus('No sections with IP addresses found.', true);
      }
      setLoading(false);
    });
  }, [logStatus]);

  // --- Fetch Devices and Current Setpoint when selectedSection changes ---
  useEffect(() => {
    // Reset devices and setpoint when section changes
    setDevices([]);
    setCurrentSetpoint(null);
    setNewValue('');
    setLampHours({});

    if (selectedSection && selectedSection.ip) {
      setLoading(true);
      let isActive = true; // Flag for async cleanup

      // Set a safety timeout to ensure loading state is reset even if requests fail
      const safetyTimeout = setTimeout(() => {
        if (isActive) {
          logStatus(
            'Timeout while fetching lamp data. Some data may be incomplete.',
            true,
          );
          setLoading(false);
        }
      }, 15000); // 15 second timeout

      logStatus(`Fetching devices and setpoint for ${selectedSection.name}...`);

      const fetchDataForSection = async () => {
        try {
          // 1. Fetch Devices for the selected section (to display cards)
          getDevicesForSection(selectedSection.id, devicesFromDb => {
            if (!isActive) return;

            setDevices(devicesFromDb || []);
            logStatus(`Found ${devicesFromDb?.length || 0} devices.`);

            // Fetch lamp hours for each device
            if (devicesFromDb?.length > 0) {
              // First fetch max setpoint from lamp 1
              readLampHours(
                selectedSection.ip!,
                502,
                1,
                msg => {
                  // Only log errors
                  if (msg.toLowerCase().includes('error')) {
                    logStatus(msg, true);
                  }
                },
                (lampIdx, hours) => {
                  // Always set loading to false if this first request completes (success or failure)
                  // This ensures we don't get stuck in loading state

                  if (hours && isActive) {
                    logStatus(`Global max hours setpoint: ${hours.max}`);
                    setCurrentSetpoint(hours.max);
                    setNewValue(hours.max.toString());

                    // Store lamp 1 hours
                    setLampHours(prev => ({
                      ...prev,
                      [1]: hours,
                    }));

                    // Now fetch hours for remaining lamps (2-4)
                    // We'll proceed regardless of success/failure for these
                    [1, 2, 3, 4].forEach(lampIndex => {
                      if (!isActive) return;

                      readLampHours(
                        selectedSection.ip!,
                        502,
                        lampIndex,
                        msg => {
                          // Only log errors
                          if (msg.toLowerCase().includes('error')) {
                            logStatus(
                              `Error reading lamp ${lampIndex}: ${msg}`,
                              true,
                            );
                          }
                        },
                        (idx, lampHours) => {
                          if (!isActive) return;

                          if (lampHours) {
                            logStatus(
                              `Lamp ${idx} hours: Current ${lampHours.current}, Max ${lampHours.max}`,
                            );
                            setLampHours(prev => ({
                              ...prev,
                              [idx]: lampHours,
                            }));
                          } else {
                            logStatus(
                              `Failed to read hours for lamp ${idx}, using defaults`,
                              true,
                            );
                            setLampHours(prev => ({
                              ...prev,
                              [idx]: {
                                current: 0,
                                max: hours ? hours.max : 5000,
                              },
                            }));
                          }
                        },
                      );
                    });
                  } else {
                    // Default if reading first lamp fails
                    logStatus(
                      'Failed to read lamp life hours. Using default 5000.',
                      true,
                    );
                    setCurrentSetpoint(5000);
                    setNewValue('5000');

                    // Set default values for all lamps
                    const defaultHours = {current: 0, max: 5000};
                    setLampHours({
                      1: defaultHours,
                      2: defaultHours,
                      3: defaultHours,
                      4: defaultHours,
                    });
                  }

                  // Always set loading to false once we've processed the first lamp
                  // This ensures the UI updates even if we're still waiting for other lamps
                  setLoading(false);
                },
              );
            } else {
              setLoading(false);
            }
          });
        } catch (error: any) {
          if (!isActive) return;
          logStatus(
            `Error fetching data for ${selectedSection.name}: ${error.message}`,
            true,
          );
          setDevices([]);
          setCurrentSetpoint(5000);
          setNewValue('5000'); // Reset/Default on error
          setLoading(false);
        }
      };

      fetchDataForSection();

      return () => {
        isActive = false;
        clearTimeout(safetyTimeout);
      }; // Cleanup
    } else {
      setDevices([]); // Clear devices if no section/IP
    }
  }, [selectedSection, logStatus]);

  // --- Handle Section Selection ---
  const handleSectionSelect = (section: SectionSummary) => {
    if (section.id !== selectedSection?.id) {
      setSelectedSection(section);
      setEdit(false); // Exit edit mode
    }
  };

  // --- Handle Input Change (Update the single 'newValue' state) ---
  const handleInputChange = (value: string) => {
    // Allow only numbers
    const numericValue = value.replace(/[^0-9]/g, '');
    setNewValue(numericValue);
  };

  // --- Handle Save Confirmation (Modal Confirm) ---
  const handleConfirmChanges = () => {
    if (!selectedSection || !selectedSection.ip) {
      logStatus('No section selected or section has no IP.', true);
      setModalVisible(false);
      return;
    }

    const numericNewValue = parseFloat(newValue);
    if (
      isNaN(numericNewValue) ||
      numericNewValue < 0 ||
      numericNewValue > 8000
    ) {
      // Added max check
      logStatus('Invalid input. Please enter hours between 0 and 8000.', true);
      return;
    }

    setModalVisible(false);
    setLoading(true);
    logStatus(
      `Setting GLOBAL lamp life setpoint for ${
        selectedSection.name
      } to ${numericNewValue.toFixed(0)}...`,
    );

    // --- Use NEW setLampLife function (expects float, uses FC16) ---
    setLampLife(selectedSection.ip, 502, numericNewValue, msg => {
      logStatus(`Modbus update: ${msg}`);
      setLoading(false);
      if (!msg.toLowerCase().includes('error')) {
        logStatus(
          `Lamp life setpoint updated successfully for ${selectedSection.name}.`,
        );
        setCurrentSetpoint(numericNewValue); // Update the displayed current setpoint
        // No individual device DB update needed for the global setpoint
        setEdit(false);
      } else {
        logStatus(
          `Failed to set lamp life setpoint for ${selectedSection.name}.`,
          true,
        );
        // Optionally revert newValue to currentSetpoint
        // setNewValue(currentSetpoint?.toString() ?? '');
      }
    });
  };

  // --- Render Functions --- (Using original structure and styles)

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
      onPress={() => handleSectionSelect(item)}
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

  // Render grid item (displays device card, input reflects global value)
  const renderGridItem = ({item}: {item: any}) => {
    // For devices with ID > 4, we'll still show them but with static data or placeholder
    // Map any device ID above 4 to use data from lamps 1-4 since we only have 4 UV lamps
    const lampIndex = Math.min(4, item.id);

    // Get the device's lamp hours
    const hours =
      item.id <= 4
        ? lampHours[lampIndex] || {current: 0, max: currentSetpoint || 5000}
        : {current: 0, max: currentSetpoint || 5000}; // Default for devices 5-6

    // For devices 5-6, add note in the UI
    const isHigherDevice = item.id > 4;

    return (
      <View style={styles.gridItem}>
        <View style={styles.card}>
          <View style={styles.cardContent}>
            <View style={styles.titleContainer}>
              <View style={styles.iconWrapper}>
                <LampIcon
                  fill={isHigherDevice ? COLORS.gray[400] : 'black'}
                  style={styles.icon}
                />
              </View>

              <Text style={styles.titleInputReadOnly}>{item.name}</Text>
            </View>

            <TextInput
              style={[
                styles.daysLeftInput,
                focusedInputId === item.id && styles.focusedInput,
                isHigherDevice && {opacity: 0.7},
              ]}
              onFocus={() => setFocusedInputId(item.id)}
              onBlur={() => setFocusedInputId(null)}
              // Display the current value being edited (newValue) or the max hours
              value={edit ? newValue : hours.max.toString()}
              editable={edit}
              placeholder="Hours"
              onChangeText={handleInputChange} // Use unified handler
              keyboardType="numeric"
              maxLength={4} // Max 8000
              returnKeyType="done"
              onSubmitEditing={() => {
                // Basic validation on submit
                const numVal = parseInt(newValue, 10);
                if (isNaN(numVal) || numVal > 8000 || numVal < 0) {
                  setNewValue(hours.max.toString()); // Revert to hours.max on invalid
                }
              }}
            />

            <View style={{marginTop: 10, alignItems: 'center'}}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: 'bold',
                  color: isHigherDevice ? COLORS.gray[400] : COLORS.gray[800],
                }}>
                Current Hours: {Math.floor(hours.current)}
              </Text>
              {isHigherDevice ? (
                <Text
                  style={{fontSize: 12, color: COLORS.gray[400], marginTop: 2}}>
                  (Not monitored)
                </Text>
              ) : (
                <Text
                  style={{fontSize: 12, color: COLORS.gray[600], marginTop: 2}}>
                  Device ID: {item.id} (Lamp {lampIndex})
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  // --- Main Return ---
  return (
    <Layout>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.teal[500]} />
        </View>
      )}

      {statusMessage ? (
        <View style={styles.statusMessageContainer}>
          <Text style={styles.statusMessageText}>{statusMessage}</Text>
        </View>
      ) : null}

      <PopupModal
        visible={modalVisible}
        onConfirm={handleConfirmChanges} // Use updated handler
        onClose={() => setModalVisible(false)}
        title="Confirmation needed"
        Icon={CheckIcon}>
        <View style={styles.modalContent}>
          <View style={styles.modalIconWrapper}>
            <LampIcon fill={COLORS.gray[600]} width={40} height={40} />
          </View>
          <Text style={styles.modalTitle}>Update Lamp Life Setpoint?</Text>
          <Text style={styles.modalSubText}>
            Are you sure you want to do this action? This can't be undone.
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
          {
            selectedSection && devices.length > 0 ? (
              <FlatList
                key={isPortrait ? 'portrait-lamp' : 'landscape-lamp'}
                numColumns={isPortrait ? 1 : 3} // Original columns
                data={devices} // Use devices state
                renderItem={renderGridItem}
                keyExtractor={item => `device-${item.id}`}
                columnWrapperStyle={
                  isPortrait ? null : styles.gridColumnWrapper
                }
                contentContainerStyle={styles.gridContentContainer}
                showsVerticalScrollIndicator={false}
                extraData={
                  edit || newValue || currentSetpoint || focusedInputId
                } // Ensure re-render
              />
            ) : !loading ? (
              <View style={styles.noSectionsContainer}>
                <Text style={styles.noSectionsText}>
                  {selectedSection ? 'No devices found.' : 'Select a section.'}
                </Text>
              </View>
            ) : null /* Show nothing while initially loading sections/devices */
          }
        </View>
      </View>

      <View style={styles.footer}>
        {edit ? (
          <>
            <TouchableOpacity
              style={[styles.cancelButton, {opacity: loading ? 0.5 : 1}]} // Use cancelButton style
              onPress={() => {
                setEdit(false);
                setNewValue(currentSetpoint?.toString() ?? ''); // Reset input
              }}
              disabled={loading}>
              <CloseIcon fill={COLORS.gray[600]} width={24} height={24} />
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveButton, // Use saveButton style
                // Remove specific background/border overrides, keep opacity
                {opacity: loading ? 0.5 : 1},
              ]}
              onPress={() => setModalVisible(true)}
              disabled={loading}>
              <CheckIcon2 fill={COLORS.good[600]} width={30} height={30} />
              <Text style={styles.buttonText}>Save Changes</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* Edit Button */
          <TouchableOpacity
            style={[styles.editButton, {opacity: loading ? 0.5 : 1}]}
            onPress={() => setEdit(true)}
            disabled={loading}>
            <EditIcon fill={COLORS.gray[600]} width={24} height={24} />
            <Text style={styles.buttonText}>Edit Lamp Life</Text>
          </TouchableOpacity>
        )}
      </View>
    </Layout>
  );
};

// --- Apply provided original styles ---
const styles = StyleSheet.create({
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
    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)', // Translated below
  },
  scrollItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderLeftWidth: 5,
    // borderLeftColor set inline
  },
  scrollItemText: {
    color: COLORS.gray[700],
    fontSize: 21,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32, // Keep consistent padding
    paddingBottom: 16, // Keep padding below header
  },
  headerTitle: {
    fontSize: 40, // Keep consistent size
    fontWeight: '500',
    color: COLORS.gray[800], // Ensure color is defined
  },
  gridContainer: {
    flex: 1,
    paddingVertical: 16, // Keep vertical padding
  },
  gridContentContainer: {
    gap: 16,
    flexGrow: 1,
    // Removed paddingHorizontal/Vertical as it's on gridContainer
  },
  gridItem: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 30,
    padding: 24,
    boxShadow: '0px 4px 24px 0px rgba(0, 0, 0, 0.05)', // Translated below
    minHeight: 180,
  },
  gridColumnWrapper: {
    gap: 16,
    justifyContent: 'space-between',
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
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
  },
  iconWrapper: {
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 1000,
    padding: 16,
    backgroundColor: COLORS.gray[50], // Keep background
  },
  icon: {
    width: 24,
    height: 24,
  },
  titleInput: {
    // Style for the device name text (appears readonly now)
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray[800], // Use consistent color
    flex: 1, // Allow text to take space
  },
  titleInputReadOnly: {
    // Style for displaying name when not editing
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray[800],
    paddingVertical: 5, // Add some padding to align roughly with input
    flexShrink: 1,
  },
  daysLeftInput: {
    fontSize: 20,
    fontWeight: '500',
    color: COLORS.gray[700],
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: COLORS.gray[100],
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 20,
    width: '100%',
    maxHeight: 60,
  },

  focusedInput: {
    borderColor: COLORS.teal[500],
    backgroundColor: 'white', // Add white background on focus
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16, // Use vertical padding consistent with others
    paddingHorizontal: 32, // Use horizontal padding
    gap: 16,
    flexDirection: 'row',
    // Removed borderTop from previous merge
  },
  // Using the consistent button styles from other tabs
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
    color: COLORS.gray[700],
  },
  // Modal styles from provided snippet + centering logic
  modalContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 20,
  },
  modalIconWrapper: {
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 1000,
    padding: 16,
    marginBottom: 12,
    backgroundColor: COLORS.gray[50],
  },
  modalIcon: {
    width: 50,
    height: 50,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray[800],
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubText: {
    fontSize: 20,
    color: COLORS.gray[600],
    width: '60%',
    textAlign: 'center',
    marginBottom: 24,
  },
  // Styles for modal list (IP Address screen? Seems out of place here but included from snippet)
  modalContentContainer: {
    gap: 16,
  },
  modalItem: {
    flexDirection: 'column',
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 12,
    padding: 12,
    width: '30%', // This might need adjustment based on context
  },
  modalItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalItemTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    minWidth: 100,
    maxWidth: '60%',
    textAlign: 'left',
  },
  modalItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray[700],
    flex: 1,
    minWidth: 60,
    textAlign: 'left',
  },
  modalItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  cancelIconWrapper: {
    borderRadius: 1000,
    padding: 6,
    backgroundColor: COLORS.error[50],
    borderWidth: 1,
    borderColor: COLORS.error[100],
  },
  modalColumnWrapper: {
    gap: 16,
  },
  // Utility Styles (Keep from current)
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
    bottom: 80, // Position above footer buttons
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
  noSectionsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.6, // Keep opacity
  },
  noSectionsText: {
    color: COLORS.gray[600],
    fontSize: 16,
  },
});

export default LampLifeScreen;
