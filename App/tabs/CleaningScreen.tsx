import React, {useState, useEffect, useCallback, memo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Layout from '../../components/Layout';
import {COLORS} from '../../constants/colors';
import {
  CheckIcon,
  CheckIcon2,
  CleaningIcon,
  CloseIcon,
  EditIcon,
  RepeatIcon,
} from '../../icons';
import CustomTabBar from '../../components/CustomTabBar';
import PopupModal from '../../components/PopupModal';
import {getSectionsWithStatus} from '../../utils/db';
import {useCurrentSectionStore} from '../../utils/useCurrentSectionStore';
import {useSectionDataStore} from '../../utils/useSectionDataStore';
import {setCleaningHoursSetpoint} from '../../utils/modbus';

interface SectionSummary {
  id: number;
  name: string;
  ip: string | null;
  working: boolean;
}

const CleaningScreen = () => {
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [selectedSection, setSelectedSection] = useState<SectionSummary | null>(
    null,
  );
  const [currentSetpoint, setCurrentSetpoint] = useState<number | null>(null);
  const [edit, setEdit] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newValue, setNewValue] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const {setCurrentSectionId} = useCurrentSectionStore();

  // Use the new centralized store
  const {
    sections: sectionDataMap,
    startPolling,
    stopPolling,
    cleanup,
  } = useSectionDataStore();

  const logStatus = useCallback((message: string, isError = false) => {
    console.log(`[Cleaning Screen Status] ${message}`);
    setStatusMessage(message);
    const timeoutId = setTimeout(
      () => setStatusMessage(''),
      isError ? 6000 : 4000,
    );
    return () => clearTimeout(timeoutId);
  }, []);

  // Fetch sections list and handle polling
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
        if (!selectedSection) {
          setSelectedSection(formattedSections[0]);
        }
      } else {
        logStatus('No sections with IP addresses found.', true);
        setSelectedSection(null);
        setCurrentSetpoint(null);
        setNewValue('');
        setLoading(false);
      }
      setLoading(false);
    });
    return () => {
      cleanup();
    };
  }, [logStatus, selectedSection, cleanup]);

  // Start polling for the selected section
  useEffect(() => {
    if (selectedSection && selectedSection.ip) {
      startPolling(selectedSection.id, selectedSection.ip);
    }
    return () => {
      if (selectedSection) {
        stopPolling(selectedSection.id);
      }
    };
  }, [selectedSection, startPolling, stopPolling]);

  // Fetch and update setpoint from the new store
  useEffect(() => {
    if (!selectedSection) {
      setCurrentSetpoint(null);
      setNewValue('');
      setLoading(false);
      return;
    }
    setLoading(true);
    const sectionData = sectionDataMap[selectedSection.id];
    if (sectionData) {
      const formattedValue = Math.round(
        sectionData.cleaningSetpoint ?? 0,
      ).toString();
      setCurrentSetpoint(parseFloat(formattedValue));
      setNewValue(formattedValue);
      setLoading(false);
    } else {
      setCurrentSetpoint(null);
      setNewValue('');
      setLoading(false);
    }
  }, [selectedSection, sectionDataMap]);

  const handleSaveChanges = async () => {
    if (!selectedSection || !selectedSection.ip) {
      logStatus('No section selected or section has no IP.', true);
      setModalVisible(false);
      return;
    }

    const numericNewValue = parseInt(newValue, 10);
    if (
      isNaN(numericNewValue) ||
      numericNewValue < 0 ||
      numericNewValue > 65535
    ) {
      logStatus(
        'Invalid Input: Please enter a valid number between 0 and 65535.',
        true,
      );
      Alert.alert(
        'Invalid Input',
        'Please enter a valid number between 0 and 65535.',
      );
      return;
    }

    setModalVisible(false);
    setIsSaving(true);
    setLoading(true);
    logStatus(
      `Setting cleaning hours for ${selectedSection.name} to ${numericNewValue}...`,
    );

    try {
      await setCleaningHoursSetpoint(
        selectedSection.ip,
        502,
        numericNewValue,
        logStatus,
      );

      logStatus(
        `Cleaning hours setpoint updated successfully for ${selectedSection.name}.`,
      );
      setCurrentSetpoint(numericNewValue);
      setEdit(false);
      Alert.alert('Success', 'Setpoint updated successfully.');
    } catch (error: any) {
      const errorMsg = `Failed to set cleaning hours for ${selectedSection.name}: ${error.message}`;
      logStatus(errorMsg, true);
      Alert.alert('Error', errorMsg);
    } finally {
      setIsSaving(false);
      setLoading(false);
    }
  };

  const keyExtractor = useCallback((item: any) => item.id.toString(), []);

  const renderItem = useCallback(
    ({item}: {item: any}) => (
      <TouchableOpacity
        onPress={() => {
          if (item.id !== selectedSection?.id && !isSaving) {
            setSelectedSection(item);
            setEdit(false);
            setCurrentSectionId(item.id);
          }
        }}
        style={[
          styles.scrollItem,
          {
            borderLeftColor:
              item.id === selectedSection?.id
                ? COLORS.teal[500]
                : COLORS.gray[200],
            opacity: isSaving ? 0.6 : 1,
          },
        ]}
        disabled={loading || isSaving}>
        <Text
          style={[
            styles.scrollItemText,
            {
              color:
                item.id === selectedSection?.id
                  ? COLORS.teal[500]
                  : COLORS.gray[800],
            },
          ]}>
          {item.name}
        </Text>
      </TouchableOpacity>
    ),
    [
      selectedSection,
      isSaving,
      loading,
      setSelectedSection,
      setEdit,
      setCurrentSectionId,
    ],
  );

  return (
    <Layout>
      {(loading || isSaving) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.teal[500]} />
          <Text style={styles.loadingText}>
            {isSaving ? 'Saving...' : 'Loading...'}
          </Text>
        </View>
      )}

      {statusMessage ? (
        <View style={styles.statusMessageContainer}>
          <Text
            style={[
              styles.statusMessageText,
              {
                color:
                  statusMessage.includes('Error') ||
                  statusMessage.includes('Failed')
                    ? 'red'
                    : 'green',
              },
            ]}>
            {statusMessage}
          </Text>
        </View>
      ) : null}

      <PopupModal
        visible={modalVisible}
        onConfirm={handleSaveChanges}
        onClose={() => setModalVisible(false)}
        title="Confirmation needed"
        Icon={CheckIcon}>
        <View style={styles.modalContent}>
          <View style={styles.modalIconWrapper}>
            <RepeatIcon width={40} height={40} />
          </View>
          <Text style={styles.modalTitle}>Update Cleaning Hours?</Text>
          <Text style={styles.modalSubText}>
            Set cleaning hours for '{selectedSection?.name}' to{' '}
            <Text style={{fontWeight: 'bold'}}>{newValue}</Text> hours?
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
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                showsVerticalScrollIndicator={false}
                extraData={`${selectedSection?.id}-${isSaving}`}
              />
            ) : !loading ? (
              <View style={styles.noSectionsContainer}>
                <Text style={styles.noSectionsText}>No sections found.</Text>
                <Text style={styles.noSectionsText}>
                  Ensure sections have IP addresses.
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.rightContainer}>
          {selectedSection ? (
            <View style={styles.gridItem}>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardIconWrapper}>
                    <CleaningIcon
                      fill={COLORS.gray[600]}
                      style={styles.cardIcon}
                    />
                  </View>
                  <Text style={styles.cardTitle}>Cleaning Hours Setpoint</Text>
                </View>
                <TextInput
                  style={[styles.cardInput, !edit && styles.cardInputDisabled]}
                  placeholder="---"
                  editable={edit && !isSaving && !loading}
                  value={newValue}
                  keyboardType="numeric"
                  onChangeText={setNewValue}
                />
              </View>
            </View>
          ) : !loading ? (
            <View style={styles.noSectionsContainer}>
              <Text style={styles.noSectionsText}>Select a section</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        {edit ? (
          <View style={styles.footerButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.cancelButton,
                {opacity: loading || isSaving ? 0.5 : 1},
              ]}
              onPress={() => {
                setEdit(false);
                setNewValue(currentSetpoint?.toString() ?? '');
              }}
              disabled={loading || isSaving}>
              <CloseIcon fill={COLORS.gray[600]} width={24} height={24} />
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveButton,
                {opacity: loading || isSaving ? 0.5 : 1},
              ]}
              onPress={() => setModalVisible(true)}
              disabled={
                loading ||
                isSaving ||
                !selectedSection ||
                newValue === (currentSetpoint?.toString() ?? '')
              }>
              <CheckIcon2 fill={COLORS.good[600]} width={30} height={30} />
              <Text style={[styles.buttonText]}>Save changes</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.footerButtonsContainer}>
            <TouchableOpacity
              style={[
                styles.editButton,
                {
                  opacity:
                    loading || isSaving
                      ? // !selectedSection ||
                        // currentSetpoint === null
                        0.5
                      : 1,
                },
              ]}
              onPress={() => setEdit(true)}
              disabled={
                loading ||
                isSaving ||
                !selectedSection ||
                currentSetpoint === null
              }>
              <EditIcon fill={COLORS.gray[600]} width={24} height={24} />
              <Text style={styles.buttonText}>Edit Cleaning Hours</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Layout>
  );
};

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
    zIndex: 10,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: COLORS.gray[700],
  },
  statusMessageContainer: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: COLORS.gray[100],
    alignItems: 'center',
    position: 'absolute',
    bottom: 80,
    left: '10%',
    right: '10%',
    borderRadius: 20,
    zIndex: 5,
  },
  statusMessageText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  modalContent: {
    alignItems: 'center',
    padding: 10,
  },
  modalIconWrapper: {
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: COLORS.gray[800],
  },
  modalSubText: {
    fontSize: 14,
    textAlign: 'center',
    color: COLORS.gray[600],
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 40,
    fontWeight: '500',
    color: COLORS.gray[800],
  },
  container: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 32,
  },
  leftContainer: {
    width: 250,
  },
  rightContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
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
  noSectionsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.6,
    padding: 20,
  },
  noSectionsText: {
    fontSize: 16,
    color: COLORS.gray[600],
    textAlign: 'center',
    marginBottom: 5,
  },
  gridItem: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 24,
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
    backgroundColor: COLORS.gray[50],
  },
  cardIcon: {
    width: 24,
    height: 24,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.gray[800],
  },
  cardInput: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.gray[800],
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.gray[50],
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 10,
    width: 150,
    textAlign: 'center',
    minHeight: 50,
  },
  cardInputDisabled: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    color: COLORS.gray[800],
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
  footerButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    width: '100%',
    paddingHorizontal: 16,
  },
  baseButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderWidth: 1,
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  buttonText: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray[700],
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
});

export default memo(CleaningScreen);
