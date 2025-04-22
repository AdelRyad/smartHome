import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
} from 'react-native';
import Layout from '../../components/Layout';
import {COLORS} from '../../constants/colors';
import {
  CalednarIocn,
  CallIcon,
  CheckIcon,
  CheckIcon2,
  CloseIcon,
  CustomerServiceIcon,
  EditIcon,
  MailIcon,
  RefrenceIcon,
} from '../../icons';
import {useWindowDimensions} from 'react-native';
import CustomTabBar from '../../components/CustomTabBar';
import DateTimePicker from '@react-native-community/datetimepicker';
import PopupModal from '../../components/PopupModal';
import {getContactInfo, updateContactInfo} from '../../utils/db';

// Define the structure for a contact field
interface ContactField {
  key: keyof ContactInfoState; // Use keys from the state type
  title: string;
  icon: React.FC<any>; // Type for icon component
  type?: 'text' | 'date' | 'phone' | 'email'; // Input type hint
}

// Define the state type for contact information
interface ContactInfoState {
  name: string;
  email: string;
  phone: string;
  project_refrence: string;
  hood_refrence: string;
  commission_date: string; // Keep as string from DB
}

// Define the fields based on the state structure
const contactFields: ContactField[] = [
  {
    key: 'project_refrence',
    title: 'Project reference',
    icon: RefrenceIcon,
    type: 'text',
  },
  {
    key: 'hood_refrence',
    title: 'Hood reference',
    icon: RefrenceIcon,
    type: 'text',
  },
  {
    key: 'commission_date',
    title: 'Commission Date',
    icon: CalednarIocn,
    type: 'date',
  },
  {key: 'phone', title: 'Phone Number', icon: CallIcon, type: 'phone'},
  {key: 'email', title: 'Email Address', icon: MailIcon, type: 'email'},
];

const ContactScreen = () => {
  const {width, height} = useWindowDimensions();
  const isPortrait = height > width;

  const [datePickerValue, setDatePickerValue] = useState(new Date()); // Separate state for date picker UI
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [edit, setEdit] = useState(false);

  // State for the actual contact info from DB
  const [contactInfo, setContactInfo] = useState<ContactInfoState>({
    name: '',
    email: '',
    phone: '',
    project_refrence: '',
    hood_refrence: '',
    commission_date: new Date().toISOString(), // Initialize with ISO string
  });

  // State for edited values, initialized with contactInfo
  const [editedContactInfo, setEditedContactInfo] =
    useState<ContactInfoState>(contactInfo);

  // Fetch initial data
  useEffect(() => {
    getContactInfo(fetchedContact => {
      console.log('Fetched contact info:', fetchedContact);

      const initialData = {
        name: fetchedContact.name || '',
        email: fetchedContact.email || '',
        phone: fetchedContact.phone || '',
        project_refrence: fetchedContact.project_refrence || '',
        hood_refrence: fetchedContact.hood_refrence || '',
        // Ensure commission_date is a valid date string or default
        commission_date:
          fetchedContact.commission_date || new Date().toISOString(),
      };
      setContactInfo(initialData);
      setEditedContactInfo(initialData); // Initialize edits with fetched data
      try {
        // Also set the date picker initial value correctly
        setDatePickerValue(new Date(initialData.commission_date));
      } catch (e) {
        console.error('Error parsing commission date for picker:', e);
        setDatePickerValue(new Date()); // Default if parsing fails
      }
    });
  }, []);

  // Handle changes to any input field
  const handleInputChange = (key: keyof ContactInfoState, value: string) => {
    setEditedContactInfo(prev => ({...prev, [key]: value}));
  };

  // Render item based on the field definition
  const renderGridItem = ({item}: {item: ContactField}) => {
    const displayValue = edit
      ? editedContactInfo[item.key]
      : contactInfo[item.key];

    // Format date for display
    const formattedDisplayValue =
      item.type === 'date'
        ? new Date(displayValue || Date.now()).toLocaleDateString() // Use locale string, handle potential invalid date
        : displayValue;

    return (
      <View style={[styles.gridItem, {maxWidth: isPortrait ? '100%' : '49%'}]}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.iconWrapper}>
              <item.icon fill={'black'} style={styles.icon} />
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </View>
          {item.type === 'date' ? (
            <TouchableOpacity
              style={styles.dateInput}
              onPress={() => {
                if (edit) {
                  // Try parsing current edited date for picker, default if invalid
                  try {
                    setDatePickerValue(new Date(editedContactInfo[item.key]));
                  } catch {
                    setDatePickerValue(new Date());
                  }
                  setShowDatePicker(true);
                }
              }}
              disabled={!edit} // Disable if not editing
            >
              <Text style={styles.dateText}>{formattedDisplayValue}</Text>
            </TouchableOpacity>
          ) : (
            <TextInput
              style={styles.input}
              placeholder={`Enter ${item.title}`}
              value={displayValue}
              editable={edit}
              onChangeText={value => handleInputChange(item.key, value)}
              keyboardType={
                item.type === 'phone'
                  ? 'phone-pad'
                  : item.type === 'email'
                  ? 'email-address'
                  : 'default'
              }
              autoCapitalize={item.type === 'email' ? 'none' : 'sentences'}
            />
          )}
        </View>
      </View>
    );
  };

  // Show confirmation modal
  const handleSaveChanges = () => {
    setModalVisible(true);
  };

  // Handle confirm changes (send edit request)
  const handleConfirmChanges = () => {
    // Construct the object expected by updateContactInfo, including the original name
    const dataToSave = {
      name: editedContactInfo.name,
      email: editedContactInfo.email,
      phone: editedContactInfo.phone,
      project_refrence: editedContactInfo.project_refrence,
      hood_refrence: editedContactInfo.hood_refrence,
      commission_date: editedContactInfo.commission_date,
    };

    // Call update function with the reconstructed data
    updateContactInfo(dataToSave, (success: boolean) => {
      if (success) {
        setContactInfo({
          name: dataToSave.name,
          email: dataToSave.email,
          phone: dataToSave.phone,
          project_refrence: dataToSave.project_refrence,
          hood_refrence: dataToSave.hood_refrence,
          commission_date: dataToSave.commission_date,
        });

        setEdit(false);
        console.log('Contact Info Updated Successfully');
      } else {
        console.error('Failed to update contact info');
        // Optionally show an error message to the user
      }
      setModalVisible(false); // Close modal regardless of success/fail
    });
  };

  return (
    <Layout>
      <PopupModal
        visible={modalVisible}
        onConfirm={handleConfirmChanges}
        onClose={() => setModalVisible(false)}
        title="Confirmation needed"
        Icon={CheckIcon}>
        <View style={styles.modalContent}>
          <View style={styles.modalIconWrapper}>
            <CustomerServiceIcon fill={'black'} style={styles.modalIcon} />
          </View>
          <Text style={styles.modalTitle}>Update contact information</Text>
          <Text style={styles.modalSubText}>
            Are you sure you want to do this action? This can't be undone.
          </Text>
        </View>
      </PopupModal>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DateTimePicker
          testID="dateTimePicker"
          value={datePickerValue}
          mode="date"
          is24Hour={true}
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false); // Hide picker immediately
            if (event.type === 'set' && selectedDate) {
              // Update the edited state with the new date's ISO string
              handleInputChange('commission_date', selectedDate.toISOString());
            }
          }}
        />
      )}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <CustomTabBar />
      </View>
      <View style={styles.container}>
        <View style={styles.gridContainer}>
          <FlatList
            key={isPortrait ? 'portrait' : 'landscape'}
            numColumns={isPortrait ? 1 : 2}
            data={contactFields} // Use contactFields as data source
            renderItem={renderGridItem}
            keyExtractor={item => item.key} // Use field key as extractor
            columnWrapperStyle={isPortrait ? null : styles.gridColumnWrapper}
            contentContainerStyle={styles.gridContentContainer}
            showsVerticalScrollIndicator={false}
            extraData={edit ? editedContactInfo : contactInfo} // Re-render when edit state or relevant data changes
          />
        </View>
      </View>
      <View style={styles.footer}>
        {edit ? (
          <>
            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setEdit(false);
                // Reset edited state back to original on cancel
                setEditedContactInfo(contactInfo);
              }}>
              <CloseIcon fill={COLORS.gray[600]} width={30} height={30} />
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>

            {/* Save Button */}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveChanges}>
              <CheckIcon2 fill={COLORS.good[600]} width={30} height={30} />
              <Text style={styles.buttonText}>Save changes</Text>
            </TouchableOpacity>
          </>
        ) : (
          /* Edit Button */
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => {
              // Ensure edits start from current saved state
              setEditedContactInfo(contactInfo);
              setEdit(true);
            }}>
            <EditIcon fill={COLORS.gray[600]} />
            <Text style={styles.buttonText}>Edit Contact Info</Text>
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
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  gridItem: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 30,
    padding: 24,
    shadowColor: '#000', // Use shadow props for iOS
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 5, // Use elevation for Android
  },
  gridColumnWrapper: {
    gap: 16,
    justifyContent: 'space-between',
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
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
  cardTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray[800],
  },
  input: {
    fontSize: 20,
    fontWeight: '500',
    color: COLORS.gray[700],
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: COLORS.gray[50],
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 20,
    width: '50%', // Adjust width as needed
    minWidth: 150,
  },
  dateInput: {
    // Style like a button but displays text
    paddingHorizontal: 16,
    paddingVertical: 18, // Match TextInput vertical padding
    backgroundColor: COLORS.gray[50],
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 20,
    width: '50%', // Adjust width as needed
    minWidth: 150,
    alignItems: 'flex-start', // Align text left
  },
  dateText: {
    fontSize: 20,
    fontWeight: '500',
    color: COLORS.gray[700],
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16, // Use vertical padding
    paddingHorizontal: 32,
    gap: 16,
    flexDirection: 'row',
  },
  // Base Button Style
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
  buttonText: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray[700],
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
});

export default ContactScreen;
