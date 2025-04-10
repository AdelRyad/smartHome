import React, {useState, useEffect} from 'react';
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
import {useWindowDimensions} from 'react-native';
import CustomTabBar from '../../components/CustomTabBar';
import PopupModal from '../../components/PopupModal';
import {getSectionsWithStatus, updateSection} from '../../utils/db'; // Import database functions

const IpAddressScreen = () => {
  const {width, height} = useWindowDimensions();
  const isPortrait = height > width;

  const [edit, setEdit] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [focusedInput, setFocusedInput] = useState<number | null>(null);
  const [edited, setEdited] = useState<
    {
      working: boolean;
      cleaningDays: number;
      id: number;
      name: string;
      ip: string;
    }[]
  >([]);
  const [sections, setSections] = useState<
    {
      id: number;
      name: string;
      ip: string;
      cleaningDays: number;
      working: boolean;
    }[]
  >([]);

  // Fetch data from the database on component mount
  useEffect(() => {
    const fetchData = async () => {
      getSectionsWithStatus(sections => {
        const formattedSections = sections.map(section => ({
          id: section.id!,
          name: section.name,
          ip: section.ip,
          cleaningDays: section.cleaningDays,
          working: section.working,
        }));
        setSections(formattedSections);
      });
    };
    fetchData();
  }, []);

  // Handle changes to the section name or IP address
  const handleFieldChange = (
    id: number,
    field: 'name' | 'ip',
    value: string,
  ) => {
    const updatedSections = sections.map(section =>
      section.id === id ? {...section, [field]: value} : section,
    );
    setSections(updatedSections);

    const editedItemIndex = edited.findIndex(item => item.id === id);
    if (editedItemIndex !== -1) {
      const updatedEdited = [...edited];
      updatedEdited[editedItemIndex] = {
        ...updatedEdited[editedItemIndex],
        [field]: value,
      };
      setEdited(updatedEdited);
    } else {
      const editedItem = updatedSections.find(section => section.id === id);
      if (editedItem) {
        setEdited([...edited, editedItem]);
      }
    }
  };

  // Handle removing an edit for a specific section
  const handleRemoveEdit = (id: number) => {
    const updatedEdited = edited.filter(item => item.id !== id);
    setEdited(updatedEdited);

    const originalItem = sections.find(section => section.id === id);
    if (originalItem) {
      const updatedSections = sections.map(section =>
        section.id === id ? originalItem : section,
      );
      setSections(updatedSections);
    }
  };

  // Handle save changes
  const handleSaveChanges = () => {
    setModalVisible(true);
  };

  // Handle confirm changes (update the database)
  const handleConfirmChanges = async () => {
    let success = true;
    for (const item of edited) {
      console.log(item.ip !== '');

      await updateSection(
        item.id,
        item.name,
        item.ip,
        item.cleaningDays,
        item.working,
        () => {},
      );
    }

    if (success) {
      Alert.alert('Success', 'Changes saved successfully.');
      setEdited([]);
      setEdit(false);
      setModalVisible(false);
    } else {
      Alert.alert('Error', 'Failed to save changes.');
    }
  };

  // Render item for the grid
  const renderGridItem = ({
    item,
  }: {
    item: {id: number; name: string; ip: string};
  }) => (
    <View style={styles.gridItem}>
      <View style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.titleContainer}>
            <TextInput
              style={styles.titleInput}
              placeholder="Enter section name"
              value={item.name}
              editable={edit}
              onChangeText={value => handleFieldChange(item.id, 'name', value)}
            />
          </View>
          <TextInput
            style={[
              styles.ipInput,
              focusedInput === item.id && styles.focusedInput,
            ]}
            onFocus={() => setFocusedInput(item.id)}
            onBlur={() => setFocusedInput(null)}
            value={item.ip}
            editable={edit}
            placeholder="Enter IP address"
            onChangeText={value => handleFieldChange(item.id, 'ip', value)}
          />
        </View>
      </View>
    </View>
  );

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
          data={edited}
          contentContainerStyle={styles.modalContentContainer}
          renderItem={({item}) => (
            <View style={styles.modalItem}>
              <View style={styles.modalItemHeader}>
                <View style={styles.iconWrapper}>
                  <IPAdressIcon fill={'black'} style={styles.icon} />
                </View>
                <Text style={styles.modalItemTitle}>{item.name}</Text>
              </View>
              <View style={styles.modalItemContent}>
                <Text style={styles.modalItemText}>{item.ip}</Text>
                <TouchableOpacity
                  style={styles.cancelIconWrapper}
                  onPress={() => handleRemoveEdit(item.id)}>
                  <CancelIcon />
                </TouchableOpacity>
              </View>
            </View>
          )}
          keyExtractor={item => item.id.toString()}
          columnWrapperStyle={isPortrait ? null : styles.modalColumnWrapper}
          numColumns={isPortrait ? 1 : 3}
        />
      </PopupModal>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <CustomTabBar />
      </View>
      <View style={styles.container}>
        <View style={styles.gridContainer}>
          <FlatList
            key={isPortrait ? 'portrait' : 'landscape'}
            numColumns={isPortrait ? 2 : 4}
            data={sections}
            renderItem={renderGridItem}
            keyExtractor={item => item.id.toString()}
            columnWrapperStyle={
              isPortrait
                ? styles.gridColumnWrapperPortrait
                : styles.gridColumnWrapper
            }
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
                setEdited([]);
              }}>
              <CloseIcon fill={COLORS.good[600]} width={30} height={30} />
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveChanges}>
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
  gridColumnWrapperPortrait: {
    gap: 16,
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
  modalColumnWrapper: {
    gap: 16,
  },
});

export default IpAddressScreen;
