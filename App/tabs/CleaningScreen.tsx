import React, {useState, useEffect, useCallback, memo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
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
import {setCleaningHoursSetpoint} from '../../utils/modbus';
import {useCurrentSectionStore} from '../../utils/useCurrentSectionStore';
import useCleaningHoursStore from '../../utils/cleaningHoursStore';

interface SectionSummary {
  id: number;
  name: string;
  ip: string | null;
  working: boolean;
}

// Memoized List Item Component
const ScrollListItem = memo(
  ({
    item,
    isSelected,
    onPress,
  }: {
    item: SectionSummary;
    isSelected: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.scrollItem,
        {
          borderLeftColor: isSelected ? COLORS.teal[500] : COLORS.gray[200],
        },
      ]}>
      <Text
        style={[
          styles.scrollItemText,
          {
            color: isSelected ? COLORS.teal[500] : COLORS.gray[800],
          },
        ]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  ),
);

// Memoized Modal Content
const ModalContent = memo(
  ({sectionName, hours}: {sectionName?: string; hours: string}) => (
    <View style={styles.modalContent}>
      <View style={styles.modalIconWrapper}>
        <RepeatIcon width={40} height={40} />
      </View>
      <Text style={styles.modalTitle}>Update Cleaning Hours?</Text>
      <Text style={styles.modalSubText}>
        Set cleaning hours for '{sectionName}' to
        <Text style={{fontWeight: 'bold'}}> {hours}</Text> hours?
      </Text>
    </View>
  ),
);

const CleaningScreen = () => {
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [selectedSection, setSelectedSection] = useState<SectionSummary | null>(
    null,
  );
  const [edit, setEdit] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newValue, setNewValue] = useState<string>('');

  const {setCurrentSectionId} = useCurrentSectionStore();
  const {remainingCleaningHours, fetchCleaningHours} = useCleaningHoursStore();

  // Fetch sections data
  useEffect(() => {
    let isMounted = true;
    getSectionsWithStatus(fetchedSections => {
      if (!isMounted) return;
      const formattedSections = fetchedSections
        .filter(section => !!section.ip)
        .map(section => ({
          id: section.id!,
          name: section.name,
          ip: section.ip,
          working: section.working,
        }));
      setSections(formattedSections);

      if (formattedSections.length > 0 && !selectedSection) {
        setSelectedSection(formattedSections[0]);
      } else if (formattedSections.length === 0) {
        setSelectedSection(null);
        setNewValue('');
      }
    });
    return () => {
      isMounted = false;
    };
  }, [selectedSection]);

  // Update current setpoint when selected section changes
  useEffect(() => {
    if (selectedSection?.id) {
      const cleaningData = remainingCleaningHours[selectedSection.id];
      if (cleaningData) {
        const formattedValue = Math.round(
          cleaningData.setpoint ?? 0,
        ).toString();
        setNewValue(formattedValue);
      } else {
        setNewValue('');
      }
    } else {
      setNewValue('');
    }
  }, [selectedSection, remainingCleaningHours]);

  // Handlers
  const handleSectionSelect = useCallback(
    (item: SectionSummary) => {
      if (item.id !== selectedSection?.id) {
        setSelectedSection(item);
        setEdit(false);
        setCurrentSectionId(item.id);
      }
    },
    [selectedSection?.id, setCurrentSectionId],
  );

  const handleSaveChanges = useCallback(async () => {
    if (!selectedSection?.ip) {
      setModalVisible(false);
      return;
    }

    const numericNewValue = parseInt(newValue, 10);

    setModalVisible(false);

    try {
      await setCleaningHoursSetpoint(selectedSection.ip, 502, numericNewValue);
      // Refresh the data after successful update
      await fetchCleaningHours();
      setEdit(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to update cleaning hours');
    }
  }, [selectedSection, newValue, fetchCleaningHours]);

  const handleCancelEdit = useCallback(() => {
    setEdit(false);
    if (selectedSection?.id) {
      const cleaningData = remainingCleaningHours[selectedSection.id];
      setNewValue(cleaningData?.setpoint?.toString() ?? '');
    }
  }, [selectedSection, remainingCleaningHours]);

  const handleEditPress = useCallback(() => {
    setEdit(true);
  }, []);

  // Render function for FlatList
  const renderScrollItem = useCallback(
    ({item}: {item: SectionSummary}) => (
      <ScrollListItem
        item={item}
        isSelected={item.id === selectedSection?.id}
        onPress={() => handleSectionSelect(item)}
      />
    ),
    [handleSectionSelect, selectedSection?.id],
  );

  return (
    <Layout>
      <PopupModal
        visible={modalVisible}
        onConfirm={handleSaveChanges}
        onClose={() => setModalVisible(false)}
        title="Confirmation needed"
        Icon={CheckIcon}>
        <ModalContent sectionName={selectedSection?.name} hours={newValue} />
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
                initialNumToRender={10}
                maxToRenderPerBatch={5}
                windowSize={5}
                extraData={selectedSection?.id}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <View style={styles.noSectionsContainer}>
                <Text style={styles.noSectionsText}>No sections found</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.rightContainer}>
          {selectedSection && (
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
                  editable={edit}
                  value={newValue}
                  keyboardType="numeric"
                  onChangeText={setNewValue}
                />
              </View>
            </View>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        {edit ? (
          <View style={styles.footerButtonsContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelEdit}>
              <CloseIcon fill={COLORS.gray[600]} width={24} height={24} />
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => setModalVisible(true)}
              disabled={
                !newValue ||
                newValue ===
                  (remainingCleaningHours[
                    selectedSection?.id
                  ]?.setpoint?.toString() ?? '')
              }>
              <CheckIcon2 fill={COLORS.good[600]} width={30} height={30} />
              <Text style={styles.buttonText}>Save changes</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.footerButtonsContainer}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={handleEditPress}
              disabled={
                !selectedSection || !remainingCleaningHours[selectedSection.id]
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

export default CleaningScreen;
