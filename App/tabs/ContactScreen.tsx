import React, {useEffect, useState, useCallback, memo} from 'react';
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
import CustomTabBar from '../../components/CustomTabBar';
import DateTimePicker from '@react-native-community/datetimepicker';
import PopupModal from '../../components/PopupModal';
import {getContactInfo, updateContactInfo} from '../../utils/db';
import modbusConnectionManager from '../../utils/modbusConnectionManager';

interface ContactField {
  key: keyof ContactInfoState;
  title: string;
  icon: React.FC<any>;
  type?: 'text' | 'date' | 'phone' | 'email';
}

interface ContactInfoState {
  name: string;
  email: string;
  phone: string;
  project_refrence: string;
  hood_refrence: string;
  commission_date: string;
}

// Memoized Contact Field Item
const ContactFieldItem = memo(
  ({
    item,
    value,
    isEdit,
    onChange,
    onDatePress,
  }: {
    item: ContactField;
    value: string;
    isEdit: boolean;
    onChange: (value: string) => void;
    onDatePress: () => void;
  }) => {
    const formattedValue =
      item.type === 'date'
        ? new Date(value || Date.now()).toLocaleDateString()
        : value;

    return (
      <View style={styles.gridItem}>
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
              onPress={onDatePress}
              disabled={!isEdit}>
              <Text style={styles.dateText}>{formattedValue}</Text>
            </TouchableOpacity>
          ) : (
            <TextInput
              style={styles.input}
              placeholder={`Enter ${item.title}`}
              value={value}
              editable={isEdit}
              onChangeText={onChange}
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
  },
);

// Memoized Modal Content
const ModalContent = memo(() => (
  <View style={styles.modalContent}>
    <View style={styles.modalIconWrapper}>
      <CustomerServiceIcon fill={'black'} style={styles.modalIcon} />
    </View>
    <Text style={styles.modalTitle}>Update contact information</Text>
    <Text style={styles.modalSubText}>
      Are you sure you want to do this action? This can't be undone.
    </Text>
  </View>
));

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
  const [datePickerValue, setDatePickerValue] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [edit, setEdit] = useState(false);
  const [contactInfo, setContactInfo] = useState<ContactInfoState>({
    name: '',
    email: '',
    phone: '',
    project_refrence: '',
    hood_refrence: '',
    commission_date: new Date().toISOString(),
  });
  const [editedContactInfo, setEditedContactInfo] =
    useState<ContactInfoState>(contactInfo);

  // Fetch initial data
  useEffect(() => {
    getContactInfo(fetchedContact => {
      const initialData = {
        name: fetchedContact.name || '',
        email: fetchedContact.email || '',
        phone: fetchedContact.phone || '',
        project_refrence: fetchedContact.project_refrence || '',
        hood_refrence: fetchedContact.hood_refrence || '',
        commission_date:
          fetchedContact.commission_date || new Date().toISOString(),
      };
      setContactInfo(initialData);
      setEditedContactInfo(initialData);
      try {
        setDatePickerValue(new Date(initialData.commission_date));
      } catch {
        setDatePickerValue(new Date());
      }
    });
    return () => {
      modbusConnectionManager.closeAll();
    };
  }, []);

  // Stable callback for input changes
  const handleInputChange = useCallback(
    (key: keyof ContactInfoState, value: string) => {
      setEditedContactInfo(prev => ({...prev, [key]: value}));
    },
    [],
  );

  // Stable callback for date picker
  const handleDatePress = useCallback(() => {
    try {
      setDatePickerValue(new Date(editedContactInfo.commission_date));
    } catch {
      setDatePickerValue(new Date());
    }
    setShowDatePicker(true);
  }, [editedContactInfo.commission_date]);

  // Stable callback for saving changes
  const handleConfirmChanges = useCallback(() => {
    const dataToSave = {
      name: editedContactInfo.name,
      email: editedContactInfo.email,
      phone: editedContactInfo.phone,
      project_refrence: editedContactInfo.project_refrence,
      hood_refrence: editedContactInfo.hood_refrence,
      commission_date: editedContactInfo.commission_date,
    };

    updateContactInfo(dataToSave, (success: boolean) => {
      if (success) {
        setContactInfo(dataToSave);
        setEdit(false);
      }
      setModalVisible(false);
    });
  }, [editedContactInfo]);

  // Optimized render function for FlatList
  const renderGridItem = useCallback(
    ({item}: {item: ContactField}) => (
      <ContactFieldItem
        key={item.key}
        item={item}
        value={editedContactInfo[item.key] || ''}
        isEdit={edit}
        onChange={value => handleInputChange(item.key, value)}
        onDatePress={handleDatePress}
      />
    ),
    [editedContactInfo, edit, handleInputChange, handleDatePress],
  );

  const keyExtractor = useCallback(
    (item: ContactField) => item.key.toString(),
    [],
  );

  return (
    <Layout>
      <PopupModal
        visible={modalVisible}
        onConfirm={handleConfirmChanges}
        onClose={() => setModalVisible(false)}
        title="Confirmation needed"
        Icon={CheckIcon}>
        <ModalContent />
      </PopupModal>

      {showDatePicker && (
        <DateTimePicker
          testID="dateTimePicker"
          value={datePickerValue}
          mode="date"
          is24Hour={true}
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (event.type === 'set' && selectedDate) {
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
            key={'landscape'}
            numColumns={2}
            data={contactFields}
            renderItem={renderGridItem}
            keyExtractor={keyExtractor}
            columnWrapperStyle={styles.gridColumnWrapper}
            contentContainerStyle={styles.gridContentContainer}
            showsVerticalScrollIndicator={false}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
            extraData={{edit, editedContactInfo, contactInfo}}
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
                setEditedContactInfo(contactInfo);
              }}>
              <CloseIcon fill={COLORS.gray[600]} width={30} height={30} />
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={() => setModalVisible(true)}>
              <CheckIcon2 fill={COLORS.good[600]} width={30} height={30} />
              <Text style={styles.buttonText}>Save changes</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => {
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
