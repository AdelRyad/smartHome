import React, {useState, useEffect, useCallback} from 'react'; // Added useCallback
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator, // Added ActivityIndicator
} from 'react-native';
import Layout from '../../components/Layout';
import {COLORS} from '../../constants/colors'; // Use your colors path
import {
  CheckIcon,
  CheckIcon2,
  CleaningIcon,
  CloseIcon,
  EditIcon,
  RepeatIcon,
} from '../../icons'; // Use your icons path
import CustomTabBar from '../../components/CustomTabBar';
import PopupModal from '../../components/PopupModal';
import {getSectionsWithStatus} from '../../utils/db'; // Use your DB utils path

// --- IMPORT NEW MODBUS FUNCTIONS ---
import {
  setCleaningHours, // Writes float32 via FC16
  readCleaningHoursSetpoint, // Reads float32 via FC03
} from '../../utils/modbus'; // Use your modbus utils path

// Define SectionSummary type
interface SectionSummary {
  id: number;
  name: string;
  ip: string | null;
  // cleaningDays is likely not the setpoint, removing it from main list summary
  working: boolean;
}

const CleaningScreen = () => {
  const [sections, setSections] = useState<SectionSummary[]>([]); // State to store sections summary
  const [selectedSection, setSelectedSection] = useState<SectionSummary | null>(
    null,
  ); // State for the currently selected section
  const [currentSetpoint, setCurrentSetpoint] = useState<number | null>(null); // State for the value read from PLC
  const [edit, setEdit] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newValue, setNewValue] = useState<string>(''); // Input value state (string)
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false); // Loading state for fetching/setting

  // --- Status Log Function ---
  const logStatus = useCallback((message: string, isError = false) => {
    console.log(`[Cleaning Screen Status] ${message}`);
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(''), isError ? 6000 : 4000);
  }, []); // No dependencies needed if not using section context here

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
          // Removed cleaningDays here, as it's likely not the setpoint
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
  }, [logStatus]); // Added logStatus dependency

  // --- Fetch Current Setpoint when selectedSection changes ---
  useEffect(() => {
    if (selectedSection && selectedSection.ip) {
      setLoading(true);
      setCurrentSetpoint(null); // Reset while fetching
      setNewValue(''); // Clear input field
      logStatus(`Fetching cleaning setpoint for ${selectedSection.name}...`);

      const timeout = setTimeout(() => {
        setLoading(false);
        logStatus(
          `Timeout fetching setpoint for ${selectedSection.name}.`,
          true,
        );
        setCurrentSetpoint(0); // Set a default or indicate error state
      }, 5000);

      // Use NEW readCleaningHoursSetpoint function
      readCleaningHoursSetpoint(
        selectedSection.ip,
        502,
        msg => {},
        value => {
          clearTimeout(timeout);
          setLoading(false);
          if (value !== null) {
            logStatus(
              `Current setpoint for ${selectedSection.name}: ${value.toFixed(
                0,
              )} hours`,
            );
            setCurrentSetpoint(value);
            setNewValue(value.toString()); // Pre-fill input with current value
          } else {
            logStatus(
              `Failed to read setpoint for ${selectedSection.name}.`,
              true,
            );
            setCurrentSetpoint(0); // Set a default or indicate error state
            setNewValue('0');
          }
        },
      );
    } else {
      // Clear setpoint if no section is selected or no IP
      setCurrentSetpoint(null);
      setNewValue('');
    }
  }, [selectedSection, logStatus]); // Rerun when selectedSection changes

  // --- Handle Modal Confirmation (Save Changes) ---
  const handleSaveChanges = () => {
    if (!selectedSection || !selectedSection.ip) {
      logStatus('No section selected or section has no IP.', true);
      setModalVisible(false);
      return;
    }

    const numericNewValue = parseFloat(newValue); // Convert input string to number
    if (isNaN(numericNewValue) || numericNewValue < 0) {
      logStatus(
        'Invalid input. Please enter a positive number for hours.',
        true,
      );
      // Optionally shake the input or provide visual feedback
      return;
    }

    setModalVisible(false); // Close confirmation modal
    setLoading(true);
    logStatus(
      `Setting cleaning hours for ${
        selectedSection.name
      } to ${numericNewValue.toFixed(0)}...`,
    );

    // Use NEW setCleaningHours function (expects float, uses FC16)
    setCleaningHours(
      selectedSection.ip, // IP address
      502, // Port
      numericNewValue, // The new value (as a number/float)
      msg => {
        logStatus(`Modbus update: ${msg}`);
        setLoading(false); // Stop loading after Modbus attempt

        // Check if Modbus reported success (adjust keywords if needed)
        if (
          !msg.toLowerCase().includes('error') &&
          !msg.toLowerCase().includes('failed') &&
          !msg.toLowerCase().includes('exception')
        ) {
          logStatus(
            `Cleaning hours setpoint updated successfully for ${selectedSection.name}.`,
          );
          // Update local state to reflect the change
          setCurrentSetpoint(numericNewValue);
          // No need to update sections list state for this value unless your DB structure links it

          // Optional: Update DB if you store this *setpoint* value there
          // updateSection(...); // Be careful what you update in the DB

          setEdit(false); // Exit edit mode on success
        } else {
          logStatus(
            `Failed to set cleaning hours for ${selectedSection.name}.`,
            true,
          );
          // Optionally revert input field to currentSetpoint if desired
          // setNewValue(currentSetpoint?.toString() ?? '');
        }
      },
    );
  };

  // --- Render Functions --- (Using original structure and styles)

  // Render item for the left scroll list
  const renderScrollItem = (
    {item}: {item: SectionSummary}, // Use SectionSummary
  ) => (
    <TouchableOpacity
      onPress={() => {
        if (item.id !== selectedSection?.id) {
          // Prevent re-selecting same section unnecessarily
          setSelectedSection(item);
          setEdit(false); // Exit edit mode when switching sections
        }
      }}
      style={[
        styles.scrollItem, // Original style
        {
          borderLeftColor:
            item.id === selectedSection?.id
              ? COLORS.teal[500]
              : COLORS.gray[200],
        }, // Original logic
      ]}
      disabled={loading} // Disable while loading
    >
      <Text
        style={[
          styles.scrollItemText, // Original style
          {
            color:
              item.id === selectedSection?.id
                ? COLORS.teal[500]
                : COLORS.gray[800],
          }, // Original logic (used gray[800] instead of 700)
        ]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  // --- Main Return --- (Using original structure)
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
        onConfirm={handleSaveChanges} // Call updated handler
        onClose={() => setModalVisible(false)}
        title="Confirmation needed"
        Icon={CheckIcon}>
        <View style={styles.modalContent}>
          <View style={styles.modalIconWrapper}>
            <RepeatIcon width={40} height={40} />
          </View>
          <Text style={styles.modalTitle}>Update Cleaning Hours?</Text>
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
            {
              sections.length > 0 ? (
                <FlatList
                  data={sections}
                  renderItem={renderScrollItem}
                  keyExtractor={item => item.id.toString()}
                  showsVerticalScrollIndicator={false}
                  extraData={selectedSection?.id} // Ensure re-render on selection change
                />
              ) : !loading ? ( // Show message if not loading and no sections
                <View style={styles.noSectionsContainer}>
                  <Text style={styles.noSectionsText}>No sections found.</Text>
                  <Text style={styles.noSectionsText}>
                    Ensure sections have IP addresses.
                  </Text>
                </View>
              ) : null /* Show nothing while initially loading sections */
            }
          </View>
        </View>

        <View style={styles.rightContainer}>
          {
            selectedSection ? ( // Only show card if a section is selected
              <View style={styles.gridItem}>
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardIconWrapper}>
                      <CleaningIcon fill={'black'} style={styles.cardIcon} />
                    </View>
                    <Text style={styles.cardTitle}>
                      Cleaning Hours Setpoint
                    </Text>
                  </View>
                  <TextInput
                    style={[
                      styles.cardInput, // Original style
                      !edit && styles.cardInputDisabled, // Style for non-editable state
                    ]}
                    placeholder="---" // Placeholder if value is null
                    editable={edit && !loading} // Editable only in edit mode and not loading
                    value={newValue} // Bind to newValue state (string)
                    keyboardType="numeric"
                    onChangeText={setNewValue} // Update newValue state directly
                    maxLength={5} // Limit input length
                  />
                </View>
              </View>
            ) : !loading ? ( // Show message if no section selected (and not loading)
              <View style={styles.noSectionsContainer}>
                <Text style={styles.noSectionsText}>Select a section</Text>
              </View>
            ) : null /* Show nothing while initially loading sections */
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
              style={[styles.saveButton, {opacity: loading ? 0.5 : 1}]} // Use saveButton style
              onPress={() => setModalVisible(true)}
              disabled={loading}>
              <CheckIcon2 fill={COLORS.good[600]} width={30} height={30} />
              <Text style={styles.buttonText}>Save changes</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* Edit Button */
          <TouchableOpacity
            style={[
              styles.editButton,
              {opacity: loading || !selectedSection ? 0.5 : 1},
            ]} // Use editButton style
            onPress={() => setEdit(true)}
            disabled={loading || !selectedSection}>
            <EditIcon fill={COLORS.gray[600]} width={24} height={24} />
            <Text style={styles.buttonText}>Edit Cleaning Hours</Text>
          </TouchableOpacity>
        )}
      </View>
    </Layout>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: '#fff', // Set by Layout presumably
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
    paddingVertical: 16, // Adjusted padding
    paddingHorizontal: 8, // Adjusted padding
    borderRadius: 20, // Adjusted radius
    boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.1)',
  },
  scrollItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderLeftWidth: 4, // Thinner border
    borderRadius: 4, // Slight rounding of selection indicator area
    marginBottom: 4, // Add gap between items
  },
  scrollItemText: {
    // color: COLORS.gray[700], // Color set inline
    fontSize: 18, // Slightly smaller font
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    marginBottom: 16, // Add margin below header
  },
  headerTitle: {
    fontSize: 40, // Match ContactScreen size
    fontWeight: '500',
    color: COLORS.gray[800], // Added color
  },
  rightContainer: {
    flex: 1,
    justifyContent: 'center', // Center vertically
    alignItems: 'center', // Center horizontally
    // Removed paddingTop
  },
  noSectionsContainer: {
    // Style for placeholder text
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.6,
  },
  noSectionsText: {
    fontSize: 16,
    color: COLORS.gray[600],
  },
  gridItem: {
    // Container for the single card
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 20, // Adjusted radius
    padding: 24,
    boxShadow: '0px 4px 24px 0px rgba(0, 0, 0, 0.05)',
  },
  card: {
    flexDirection: 'row', // Keep original
    justifyContent: 'space-between',
    alignItems: 'center', // Vertically center items in card
    gap: 24, // Adjusted gap
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardIconWrapper: {
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 1000,
    padding: 16,
    backgroundColor: COLORS.gray[50], // Light background for icon
  },
  cardIcon: {
    width: 24,
    height: 24,
  },
  cardTitle: {
    fontSize: 20, // Adjusted size
    fontWeight: '600',
    color: COLORS.gray[800],
  },
  cardInput: {
    fontSize: 20, // Keep size
    fontWeight: '600', // Make input value bolder
    color: COLORS.gray[800], // Darker text
    paddingHorizontal: 16,
    paddingVertical: 12, // Adjust padding
    backgroundColor: COLORS.gray[50], // Lighter background
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 10, // Less round
    width: 150, // Fixed width for input
    textAlign: 'center', // Center text in input
    maxHeight: 60,
  },
  cardInputDisabled: {
    // Style when not editable
    borderColor: 'transparent', // No border
    color: COLORS.gray[700], // Regular text color
  },
  // --- Footer Styles (Adapted from LampLifeScreen/ContactScreen) ---
  footer: {
    width: '100%',
    alignItems: 'center', // Center buttons horizontally
    justifyContent: 'center', // Center buttons horizontally
    paddingVertical: 16, // Consistent padding
    paddingHorizontal: 32,
    gap: 16, // Space between buttons
    flexDirection: 'row', // Arrange buttons in a row
  },
  // Base Button Style (Common properties - Reuse from LampLife)
  baseButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderWidth: 1,
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  // Edit Button (Reuse from LampLife)
  editButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderWidth: 1,
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    borderColor: COLORS.gray[200],
    backgroundColor: 'white',
  },
  // Cancel Button (Reuse from LampLife)
  cancelButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderWidth: 1,
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    borderColor: COLORS.gray[200],
    backgroundColor: 'white',
  },
  // Save Button (Reuse from LampLife)
  saveButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderWidth: 1,
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    borderColor: COLORS.gray[200],
    backgroundColor: 'white',
  },
  // Button Text Style (Reuse from LampLife)
  buttonText: {
    fontSize: 24, // Consistent size
    fontWeight: '600',
    color: COLORS.gray[700],
  },
  // --- Modals (Apply ContactScreen Styles) ---
  modalContent: {
    flex: 1, // Use flex: 1 to allow centering within the modal space
    justifyContent: 'center',
    alignItems: 'center', // Center items horizontally
    paddingBottom: 20, // Keep existing padding if needed, or adjust
  },
  modalIconWrapper: {
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 1000,
    padding: 16, // Match ContactScreen padding
    marginBottom: 12, // Match ContactScreen margin
  },
  modalIcon: {
    width: 50, // Keep size
    height: 50,
  },
  modalTitle: {
    fontSize: 24, // Match ContactScreen size
    fontWeight: '600',
    color: COLORS.gray[800], // Match ContactScreen color
    marginBottom: 8, // Match ContactScreen margin
    textAlign: 'center', // Ensure title is centered if it wraps
  },
  modalSubText: {
    fontSize: 20, // Match ContactScreen size
    color: COLORS.gray[600],
    width: '60%', // Match ContactScreen width
    textAlign: 'center', // Ensure text is centered
    marginBottom: 24, // Match ContactScreen margin
  },
  // --- Utility ---
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
    bottom: 20,
    left: '10%',
    right: '10%',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    zIndex: 1100,
    alignItems: 'center',
  },
  statusMessageText: {color: 'white', textAlign: 'center', fontSize: 14},
});

export default CleaningScreen;
