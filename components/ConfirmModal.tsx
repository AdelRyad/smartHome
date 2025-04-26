import React from 'react';
import {Modal, View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {COLORS} from '../constants/colors';
import PopupModal from './PopupModal';

interface ConfirmModalProps {
  visible: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => (
  <PopupModal
    visible={visible}
    onConfirm={() => {}}
    onClose={() => setModalMode(null)}
    title="Confirmation needed"
    Icon={modalMode === 'cleaning' ? RemoveIcon : RepeatIcon}>
    {modalMode === 'cleaning' && (
      <View style={styles.modalContent}>
        <View style={styles.modalIconWrapper}>
          <RemoveIcon fill={'black'} style={styles.modalIcon} />
        </View>
        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={styles.modalSubText}>{message}</Text>
        <View style={styles.modalDeviceInfo}>
          <Text style={styles.modalDeviceName}>{section?.name}</Text>
        </View>
      </View>
    )}
    {modalMode === 'resetLamp' && (
      <View style={styles.modalContent}>
        <View style={styles.modalIconWrapper}>
          <RepeatIcon style={styles.modalIcon} />
        </View>
        <Text style={styles.modalTitle}>Reset Hours for Selected Lamps?</Text>
        <Text style={styles.modalSubText}>
          Are you sure you want to reset the run hours for the selected lamps?
          This action cannot be undone.
        </Text>
        <FlatList
          data={selectedDevices}
          renderItem={({item}) => {
            const hoursInfo = workingHours[item.id];
            return (
              <View style={styles.modalDeviceInfo}>
                <Text style={styles.modalDeviceName}>{item.name}</Text>
                <Text style={styles.modalDeviceTime}>
                  {`Current: ${
                    hoursInfo?.currentHours !== null
                      ? Math.floor(hoursInfo.currentHours)
                      : 'N/A'
                  } / ${hoursInfo?.maxHours ? hoursInfo.maxHours : 'N/A'} hrs`}
                </Text>
              </View>
            );
          }}
          keyExtractor={item => item.id}
          style={styles.modalDeviceList}
        />
      </View>
    )}
  </PopupModal>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    minWidth: 280,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: COLORS.gray[800],
  },
  message: {
    fontSize: 16,
    color: COLORS.gray[700],
    marginBottom: 24,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.gray[200],
    alignItems: 'center',
  },
  confirmButton: {
    flex: 1,
    marginLeft: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.teal[500],
    alignItems: 'center',
  },
  cancelText: {
    color: COLORS.gray[800],
    fontWeight: '600',
  },
  confirmText: {
    color: 'white',
    fontWeight: '600',
  },
});

export default ConfirmModal;
