import React from 'react';
import {Modal, View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {CloseIcon} from '../icons';
import {COLORS} from '../constants/colors';

const PopupModal = ({
  visible,
  onClose,
  children,
  title,
  Icon,
  onConfirm,
  hideAcitons = false,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
  Icon: React.ElementType;
  onConfirm: () => void;
  hideAcitons?: boolean;
}) => {
  return (
    <Modal
      backdropColor={'rgba(0, 0, 0, 0.5)'}
      visible={visible}
      animationType="fade">
      <View style={styles.modal}>
        <View style={styles.body}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.iconWrapper}>
                <Icon fill={'black'} width={27} height={27} />
              </View>
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <CloseIcon fill={'black'} width={24} height={24} />
            </TouchableOpacity>
          </View>
          <View style={styles.content}>{children}</View>
          {hideAcitons ? null : (
            <View style={styles.footer}>
              <TouchableOpacity onPress={onClose} style={styles.button}>
                <Text style={styles.buttonText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onConfirm}
                style={[styles.button, styles.confirmButton]}>
                <Text style={[styles.buttonText, styles.confirmButtonText]}>
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modal: {
    padding: 37,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  body: {
    padding: 32,
    backgroundColor: 'white',
    borderRadius: 50,
    width: 600,
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    width: '100%',
    marginBottom: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconWrapper: {
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 1000,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  closeButton: {
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 1000,
    padding: 12,
  },
  content: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  button: {
    marginTop: 20,
    padding: 10,
    borderRadius: 24,
    flex: 1,
    paddingHorizontal: 40,
    paddingVertical: 16,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },
  buttonText: {
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 20,
  },
  confirmButton: {
    backgroundColor: COLORS.teal[500],
    borderColor: COLORS.teal[500],
  },
  confirmButtonText: {
    color: 'white',
  },
});

export default PopupModal;
