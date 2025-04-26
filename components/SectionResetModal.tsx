import React from 'react';
import {View, Text, FlatList, StyleSheet} from 'react-native';
import PopupModal from './PopupModal';
import {CleaningIcon, RepeatIcon} from '../icons';
import {COLORS} from '../constants/colors';

interface SectionResetModalProps {
  visible: boolean;
  mode: 'resetLamp' | 'cleaning' | null;
  onConfirm: () => void;
  onClose: () => void;
  section: {name?: string} | null;
  selectedDevices: any[];
  workingHours: Record<
    number,
    {currentHours: number | null; maxHours: number | null}
  >;
}

const SectionResetModal: React.FC<SectionResetModalProps> = ({
  visible,
  mode,
  onConfirm,
  onClose,
  section,
  selectedDevices,
  workingHours,
}) => {
  return (
    <PopupModal
      visible={visible}
      onConfirm={onConfirm}
      onClose={onClose}
      title="Confirmation needed"
      Icon={mode === 'cleaning' ? CleaningIcon : RepeatIcon}>
      {mode === 'cleaning' && (
        <View style={styles.modalContent}>
          <View style={styles.modalIconWrapper}>
            <CleaningIcon fill={'black'} style={styles.modalIcon} />
          </View>
          <Text style={styles.modalTitle}>Reset Cleaning Hours?</Text>
          <Text style={styles.modalSubText}>
            Are you sure you want to reset the cleaning run hours for all lamps
            in this section?
          </Text>
          <View style={styles.modalDeviceInfo}>
            <Text style={styles.modalDeviceName}>{section?.name}</Text>
          </View>
        </View>
      )}
      {mode === 'resetLamp' && (
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
                    } / ${
                      hoursInfo?.maxHours ? hoursInfo.maxHours : 'N/A'
                    } hrs`}
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
};

const styles = StyleSheet.create({
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
  },
  modalSubText: {
    fontSize: 20,
    color: COLORS.gray[600],
    width: '60%',
    textAlign: 'center',
  },
  modalDeviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: 1000,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.25,
    shadowRadius: 1,
    elevation: 1,
    marginTop: 24,
    backgroundColor: 'white',
  },
  modalDeviceName: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalDeviceTime: {
    color: COLORS.gray[600],
    fontWeight: '500',
  },
  modalDeviceList: {
    width: '100%',
    marginTop: 12,
  },
});

export default SectionResetModal;
