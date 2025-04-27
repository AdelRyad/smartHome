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
  CancelIcon,
  CheckIcon,
  CheckIcon2,
  CloseIcon,
  EditIcon,
  IPAdressIcon,
} from '../../icons';
import CustomTabBar from '../../components/CustomTabBar';
import PopupModal from '../../components/PopupModal';
import {getSectionsWithStatus, updateSection} from '../../utils/db';
import modbusConnectionManager from '../../utils/modbusConnectionManager';

interface Section {
  id: number;
  name: string;
  ip: string;
  cleaningDays: number;
  working: boolean;
}

// Memoized Grid Item Component
const GridItem = memo(
  ({
    item,
    isEdit,
    isFocused,
    onFieldChange,
    onFocus,
    onBlur,
  }: {
    item: Section;
    isEdit: boolean;
    isFocused: boolean;
    onFieldChange: (field: 'name' | 'ip', value: string) => void;
    onFocus: () => void;
    onBlur: () => void;
  }) => (
    <View style={styles.gridItem}>
      <View style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.titleContainer}>
            <TextInput
              style={styles.titleInput}
              placeholder="Enter section name"
              value={item.name}
              editable={isEdit}
              onChangeText={value => onFieldChange('name', value)}
            />
          </View>
          <TextInput
            style={[styles.ipInput, isFocused && styles.focusedInput]}
            onFocus={onFocus}
            onBlur={onBlur}
            value={item.ip}
            editable={isEdit}
            placeholder="Enter IP address"
            onChangeText={value => onFieldChange('ip', value)}
          />
        </View>
      </View>
    </View>
  ),
);

// Memoized Modal Item
const ModalItem = memo(
  ({item, onRemove}: {item: Section; onRemove: () => void}) => (
    <View style={styles.modalItem}>
      <View style={styles.modalItemHeader}>
        <View style={styles.iconWrapper}>
          <IPAdressIcon fill={'black'} style={styles.icon} />
        </View>
        <Text style={styles.modalItemTitle}>{item.name}</Text>
      </View>
      <View style={styles.modalItemContent}>
        <Text style={styles.modalItemText}>{item.ip}</Text>
        <TouchableOpacity style={styles.cancelIconWrapper} onPress={onRemove}>
          <CancelIcon />
        </TouchableOpacity>
      </View>
    </View>
  ),
);

const IpAddressScreen = () => {
  const [edit, setEdit] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [focusedInputId, setFocusedInputId] = useState<number | null>(null);
  const [editedSections, setEditedSections] = useState<Section[]>([]);
  const [sections, setSections] = useState<Section[]>([]);

  // Fetch data from the database
  useEffect(() => {
    const fetchData = () => {
      getSectionsWithStatus(sections => {
        const formattedSections = sections.map(section => ({
          id: section.id!,
          name: section.name || '',
          ip: section.ip,
          cleaningDays: section.cleaningDays || 0,
          working: section.working || false,
        }));
        setSections(formattedSections);
      });
    };
    fetchData();
    return () => {
      modbusConnectionManager.closeAll();
    };
  }, []);

  // Handle field changes with useCallback
  const handleFieldChange = useCallback(
    (id: number, field: 'name' | 'ip', value: string) => {
      setSections(prev =>
        prev.map(section =>
          section.id === id ? {...section, [field]: value} : section,
        ),
      );

      setEditedSections(prev => {
        const existingIndex = prev.findIndex(item => item.id === id);
        if (existingIndex !== -1) {
          const updated = [...prev];
          updated[existingIndex] = {...updated[existingIndex], [field]: value};
          return updated;
        } else {
          const section = sections.find(s => s.id === id);
          if (section) {
            return [...prev, {...section, [field]: value}];
          }
          return prev;
        }
      });
    },
    [sections],
  );

  // Handle remove edit with useCallback
  const handleRemoveEdit = useCallback(
    (id: number) => {
      setEditedSections(prev => prev.filter(item => item.id !== id));

      // Revert to original value
      const originalSection = sections.find(s => s.id === id);
      if (originalSection) {
        setSections(prev =>
          prev.map(section => (section.id === id ? originalSection : section)),
        );
      }
    },
    [sections],
  );

  // Handle save changes with useCallback
  const handleSaveChanges = useCallback(() => {
    setModalVisible(true);
  }, []);

  // Handle confirm changes with useCallback
  const handleConfirmChanges = useCallback(async () => {
    try {
      const updatePromises = editedSections.map(item =>
        updateSection(
          item.id,
          item.name,
          item.ip,
          item.cleaningDays,
          item.working,
          () => {},
        ),
      );

      await Promise.all(updatePromises);
      Alert.alert('Success', 'Changes saved successfully.');
      setEditedSections([]);
      setEdit(false);
    } catch (error) {
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      setModalVisible(false);
    }
  }, [editedSections]);

  // Render function for grid items with useCallback
  const renderGridItem = useCallback(
    ({item}: {item: Section}) => (
      <GridItem
        item={item}
        isEdit={edit}
        isFocused={focusedInputId === item.id}
        onFieldChange={(field, value) =>
          handleFieldChange(item.id, field, value)
        }
        onFocus={() => setFocusedInputId(item.id)}
        onBlur={() => setFocusedInputId(null)}
      />
    ),
    [edit, focusedInputId, handleFieldChange],
  );

  // Render function for modal items with useCallback
  const renderModalItem = useCallback(
    ({item}: {item: Section}) => (
      <ModalItem item={item} onRemove={() => handleRemoveEdit(item.id)} />
    ),
    [handleRemoveEdit],
  );

  const keyExtractor = useCallback((item: Section) => item.id.toString(), []);

  return (
    <Layout>
      <PopupModal
        visible={modalVisible}
        onConfirm={handleConfirmChanges}
        onClose={() => setModalVisible(false)}
        title="Confirmation needed"
        Icon={CheckIcon}>
        <Text style={styles.modalTitle}>Change IP Address</Text>
        <Text style={styles.modalSubText}>
          Are you sure you want to do this action? This can't be undone.
        </Text>
        <FlatList
          data={editedSections}
          contentContainerStyle={styles.modalContentContainer}
          renderItem={renderModalItem}
          keyExtractor={item => item.id.toString()}
          columnWrapperStyle={styles.gridColumnWrapper}
          numColumns={3}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
        />
      </PopupModal>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <CustomTabBar />
      </View>

      <View style={styles.container}>
        <View style={styles.gridContainer}>
          <FlatList
            data={sections}
            renderItem={renderGridItem}
            keyExtractor={keyExtractor}
            numColumns={4}
            columnWrapperStyle={styles.gridColumnWrapper}
            contentContainerStyle={styles.gridContentContainer}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>

      <View style={styles.footer}>
        {edit ? (
          <>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setEdit(false);
                setEditedSections([]);
              }}>
              <CloseIcon fill={COLORS.good[600]} width={30} height={30} />
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveChanges}
              disabled={editedSections.length === 0}>
              <CheckIcon2 fill={COLORS.good[600]} width={30} height={30} />
              <Text style={styles.buttonText}>Save changes</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setEdit(true)}>
            <EditIcon />
            <Text style={styles.buttonText}>Edit IP Address</Text>
          </TouchableOpacity>
        )}
      </View>
    </Layout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    gap: 32,
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
  },
  gridContainer: {
    flex: 1,
  },
  gridContentContainer: {
    gap: 16,
    flexGrow: 1,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  gridItem: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 30,
    padding: 24,
    boxShadow: '0px 4px 24px 0px rgba(0, 0, 0, 0.05)',
    minHeight: 180,
  },
  gridColumnWrapper: {
    gap: 16,
    justifyContent: 'space-between',
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
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: '600',
  },
  ipInput: {
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
  },
  focusedInput: {
    borderColor: COLORS.teal[500],
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 16,
    gap: 16,
    flexDirection: 'row',
  },
  editButton: {
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
  modalTitle: {
    fontSize: 24,
    fontWeight: '600',
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
    width: '30%',
  },
  modalItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconWrapper: {
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 1000,
    padding: 10,
  },
  icon: {
    width: 24,
    height: 24,
  },
  modalItemTitle: {
    fontSize: 18,
    fontWeight: '600',
    maxWidth: '65%',
  },
  modalItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  modalItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray[700],
    maxWidth: '65%',
  },
  cancelIconWrapper: {
    borderRadius: 1000,
    padding: 6,
    backgroundColor: COLORS.error[50],
    borderWidth: 1,
    borderColor: COLORS.error[100],
  },
});

export default IpAddressScreen;
