import React, {useState, useRef} from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Modal,
  NativeModules,
  TouchableWithoutFeedback,
} from 'react-native';
import {
  LampIcon,
  HomeIcon,
  Logo,
  SettingsIcon,
  GridIcon,
  DoorIcon,
  CleaningIcon,
  CheckIcon,
  CustomerServiceIcon,
  InActiveHomeIcon,
  FanIcon,
  Settings2Icon,
  LockIcon,
} from '../icons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {COLORS} from '../constants/colors';
import {getSectionsWithStatus} from '../utils/db';
import {useStatusStore} from '../utils/statusStore';
import TooltipContent from './TooltipContent';
import PopupModal from './PopupModal';

if (UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const Header = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const currentPage = route.name;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [password, setPassword] = useState(['', '', '', '']);

  const handleKeyPress = (key: string | number) => {
    let newPassword = [...password];

    if (key === 'DEL') {
      // Find the index of the last non-empty digit
      let lastFilledIndex = newPassword.length - 1;
      while (lastFilledIndex >= 0 && newPassword[lastFilledIndex] === '') {
        lastFilledIndex--;
      }

      // If a non-empty digit is found, clear it
      if (lastFilledIndex >= 0) {
        newPassword[lastFilledIndex] = '';
      }
    } else {
      // Find the first empty digit and fill it
      const firstEmptyIndex = newPassword.findIndex(p => p === '');
      if (firstEmptyIndex !== -1) {
        newPassword[firstEmptyIndex] = key.toString();
      }
    }

    setPassword(newPassword);

    // Check if the password is correct
    if (newPassword.join('') === '3536') {
      if (NativeModules.KioskModule) {
        NativeModules.KioskModule.stopKioskMode();
      }
      setIsModalVisible(false);
    }
  };

  const params = route.params as {sectionId?: number};

  const [sections, setSections] = useState<
    {id: number; name: string; cleaningDays: number}[]
  >([]);

  React.useEffect(() => {
    getSectionsWithStatus(secs => {
      setSections(
        secs
          .filter(s => s.id !== undefined)
          .map(s => ({id: s.id!, name: s.name, cleaningDays: s.cleaningDays})),
      );
    });
  }, []);

  const {statusBySection} = useStatusStore();

  // Helper to get section name by id

  // Aggregate error/warning counts for each status type
  const dpsErrorCount = Object.values(statusBySection).filter(
    s => s.dps.status === 'error',
  ).length;
  const dpsWarningCount = Object.values(statusBySection).filter(
    s => s.dps.status === 'warning',
  ).length;
  const pressureErrorCount = Object.values(statusBySection).filter(
    s => s.pressureButton.status === 'error',
  ).length;
  const pressureWarningCount = Object.values(statusBySection).filter(
    s => s.pressureButton.status === 'warning',
  ).length;
  const lampErrorCount = Object.values(statusBySection).filter(s =>
    Object.values(s.lamps).some(lamp => lamp.status === 'error'),
  ).length;
  const lampWarningCount = Object.values(statusBySection).filter(s =>
    Object.values(s.lamps).some(lamp => lamp.status === 'warning'),
  ).length;
  const cleaningErrorCount = Object.values(statusBySection).filter(
    s => s.cleaning.status === 'error',
  ).length;
  const cleaningWarningCount = Object.values(statusBySection).filter(
    s => s.cleaning.status === 'warning',
  ).length;

  const errorCount =
    dpsErrorCount + pressureErrorCount + lampErrorCount + cleaningErrorCount;
  const warningCount =
    dpsWarningCount +
    pressureWarningCount +
    lampWarningCount +
    cleaningWarningCount;

  const elements = [
    {
      title: 'dps_pressure',
      icon: FanIcon, // Replace with DPS icon if you have one
      status:
        dpsErrorCount > 0 ? 'error' : dpsWarningCount > 0 ? 'warning' : 'good',
      errorCount: dpsErrorCount,
      warningCount: dpsWarningCount,
    },
    {
      title: 'lamp',
      icon: LampIcon,
      status:
        lampErrorCount > 0
          ? 'error'
          : lampWarningCount > 0
          ? 'warning'
          : 'good',
      errorCount: lampErrorCount,
      warningCount: lampWarningCount,
    },
    {
      title: 'pressure',
      icon: GridIcon, // Placeholder
      status:
        pressureErrorCount > 0
          ? 'error'
          : pressureWarningCount > 0
          ? 'warning'
          : 'good',
      errorCount: pressureErrorCount,
      warningCount: pressureWarningCount,
    },
    {
      title: 'door',
      icon: DoorIcon, // Placeholder
      status: 'good',
      errorCount: 0,
      warningCount: 0,
    },
    {
      title: 'cleaning',
      icon: CleaningIcon,
      status:
        cleaningErrorCount > 0
          ? 'error'
          : cleaningWarningCount > 0
          ? 'warning'
          : 'good',
      errorCount: cleaningErrorCount,
      warningCount: cleaningWarningCount,
    },
  ];

  const [tooltip, setTooltip] = useState<{
    title: string;
    index: number;
    position: {x: number; y: number};
    lampWarnings?: {
      sectionId: string;
      lampId: string;
      status: string;
      percentLeft: number;
    }[];
  } | null>(null);

  const iconRefs = useRef<(View | null)[]>([]);

  const handlePress = (index: number, title: string) => {
    const iconRef = iconRefs.current[index];

    if (!iconRef) return;

    iconRef.measure((x, y, width, height, pageX, pageY) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      setTooltip(prev =>
        prev?.index === index
          ? null
          : {
              title,
              index,
              position: {
                x: pageX + width / 2, // Start at center
                y: pageY + height - 10, // Position below icon
              },
              // Add lamp warnings/errors for tooltip
              lampWarnings: Object.values(statusBySection)
                .filter(s =>
                  Object.values(s.lamps).some(
                    lamp =>
                      lamp.status === 'error' || lamp.status === 'warning',
                  ),
                )
                .map(w => ({
                  sectionId: String(
                    Object.keys(statusBySection).find(
                      (key: string) =>
                        (statusBySection as Record<string, typeof w>)[key] ===
                        w,
                    ),
                  ),
                  lampId: String(
                    Object.keys(w.lamps).find(
                      lampId =>
                        w.lamps[Number(lampId)].status === 'error' ||
                        w.lamps[Number(lampId)].status === 'warning',
                    ),
                  ), // Extract the lamp ID with error or warning status
                  status:
                    Object.values(w.lamps).find(
                      lamp =>
                        lamp.status === 'error' || lamp.status === 'warning',
                    )?.status || 'good', // Extract the status or default to 'good'
                  percentLeft: 0, // Replace with a default value or remove if unnecessary
                })),
            },
      );
    });
  };

  const closeTooltip = () => {
    setTooltip(null);
  };

  // Modified Header component tooltip section

  return (
    <View style={styles.header}>
      <PopupModal
        hideAcitons={true}
        visible={isModalVisible}
        onClose={() => {
          setIsModalVisible(false);
        }}
        title="Enter Password"
        onConfirm={() => {}}
        Icon={LockIcon}>
        <View style={styles.otpContainer}>
          {password.map((digit, index) => (
            <View key={index} style={styles.otpBox}>
              <Text style={styles.otpText}>{digit}</Text>
            </View>
          ))}
        </View>
        <View style={styles.keypad}>
          {[
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
            ['0', 'DEL'],
          ].map((row, rowIndex) => (
            <View key={rowIndex} style={styles.keyRow}>
              {row.map((num, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.keyButton}
                  onPress={() => handleKeyPress(num)}>
                  <Text style={styles.keyText}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </PopupModal>
      <TouchableOpacity
        onLongPress={() => {
          setIsModalVisible(true);
          setPassword(['', '', '', '']);
        }}
        delayLongPress={5000}>
        <Logo />
      </TouchableOpacity>
      <View style={styles.nav}>
        <View style={styles.navLinks}>
          <TouchableOpacity
            style={[styles.link, currentPage === 'Home' && styles.activeLink]}
            onPress={() => navigation.navigate('Home' as never)}>
            {currentPage === 'Home' ? <HomeIcon /> : <InActiveHomeIcon />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.link,
              currentPage !== 'ContactUs' &&
                currentPage !== 'Home' &&
                currentPage !== 'Section' &&
                styles.activeLink,
            ]}
            onPress={() => navigation.navigate('Settings' as never)}>
            {currentPage !== 'ContactUs' &&
            currentPage !== 'Home' &&
            currentPage !== 'Section' ? (
              <Settings2Icon />
            ) : (
              <SettingsIcon />
            )}
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollViewContent}>
          <View style={styles.control}>
            <View style={styles.status}>
              {elements.map((item, index) => (
                <View key={index} style={styles.iconWrapper}>
                  <View
                    ref={el => (iconRefs.current[index] = el as View | null)}
                    style={styles.statusIconContainer}>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => handlePress(index, item.title)}>
                      <View
                        style={[
                          styles.statusIndicator,
                          {backgroundColor: COLORS[item.status][500]},
                        ]}>
                        {item.errorCount > 0 ? (
                          <Text style={styles.statusText}>
                            {item.errorCount}
                          </Text>
                        ) : item.warningCount > 0 ? (
                          <Text style={styles.statusText}>
                            {item.warningCount}
                          </Text>
                        ) : (
                          <CheckIcon fill="#fff" style={styles.checkIcon} />
                        )}
                      </View>
                      <item.icon
                        fill={
                          item.title !== 'pressure'
                            ? COLORS[item.status][500]
                            : '#fff'
                        }
                        stroke={
                          item.title === 'pressure'
                            ? COLORS[item.status][500]
                            : ''
                        }
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[
                  styles.supportButton,
                  {
                    backgroundColor:
                      currentPage === 'ContactUs' ? COLORS.teal[500] : '#fff',
                  },
                ]}
                onPress={() => {
                  navigation.navigate('ContactUs' as never);
                }}>
                <CustomerServiceIcon
                  fill={currentPage === 'ContactUs' ? '#fff' : '#000'}
                  width={30}
                  height={30}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.warningButton,
                  {
                    backgroundColor:
                      errorCount > 0
                        ? COLORS.error[500]
                        : warningCount > 0
                        ? COLORS.warning[500]
                        : COLORS.good[500],
                  },
                ]}>
                {/* if at least we have one warning the background should be yellow and if all are ok the background should be green and if we have one error the background should be red */}
                <CheckIcon fill={'#fff'} style={styles.checkIcon} />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Tooltip as a Modal */}
      <Modal
        visible={!!tooltip}
        transparent
        animationType="fade"
        onRequestClose={closeTooltip}>
        <TouchableWithoutFeedback onPress={closeTooltip}>
          <View style={styles.modalOverlay}>
            {tooltip && (
              <View
                style={[
                  styles.tooltipContainer,
                  {
                    top: tooltip.position.y,
                    left: tooltip.position.x - 160, // Center the tooltip (half of width)
                  },
                ]}>
                <View style={styles.tooltipTriangle} />
                <View style={styles.tooltipContent}>
                  {/* Use our improved TooltipContent component */}
                  <TooltipContent
                    type={tooltip.title}
                    statusSummary={useStatusStore
                      .getState()
                      .getSectionStatusSummary(tooltip.title)}
                  />
                </View>
              </View>
            )}
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

export default Header;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    gap: 64,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    position: 'relative',
  },
  nav: {
    flexDirection: 'row',
    gap: 32,
    flex: 1,
  },
  navLinks: {
    flexDirection: 'row',
    gap: 32,
  },
  link: {
    padding: 16,
    borderRadius: 16,
    width: 72,
    height: 72,
    borderWidth: 1,
    borderColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeLink: {
    backgroundColor: COLORS.teal[50],
  },
  scrollViewContent: {
    flexGrow: 1,
  },
  control: {
    flexDirection: 'row',
    gap: 32,
    alignItems: 'center',
    borderColor: '#F5F5F5',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flex: 1,
    justifyContent: 'space-between',
  },
  status: {
    flexDirection: 'row',
    gap: 64,
    alignItems: 'center',
  },
  iconWrapper: {
    alignItems: 'center',
  },
  statusIconContainer: {
    position: 'relative',
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIndicator: {
    position: 'absolute',
    right: -8,
    top: -8,
    width: 20,
    height: 20,
    borderRadius: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  statusText: {
    color: '#fff',
  },
  checkIcon: {
    backgroundColor: 'transparent',
    borderRadius: 1000,
    width: 22,
    height: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 32,
    alignItems: 'center',
  },
  supportButton: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F5F5F5',
    width: 48,
    height: 48,
  },
  warningButton: {
    backgroundColor: COLORS.warning[500],
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    width: 48,
    height: 48,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipContainer: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 100,
    elevation: 5,
  },
  tooltipTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#181D27',
    alignSelf: 'center',
    marginBottom: -1,
  },
  tooltipContent: {
    backgroundColor: '#181D27',
    padding: 10,
    borderRadius: 6,
    flexDirection: 'row',
    gap: 10,
    width: 300,
    alignItems: 'center',
  },
  tooltipText: {
    color: '#fff',
    fontSize: 12,
    flex: 1, // Allow text to take up remaining space
    marginRight: 10, // Add spacing between text and icon
  },
  tooltipIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  otpBox: {
    flex: 1,
    width: 70,
    height: 70,
    borderWidth: 2,
    borderColor: COLORS.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
    borderRadius: 10,
  },
  otpText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  keypad: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 16,
  },
  keyButton: {
    flex: 1,
    paddingVertical: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.gray[100],
    borderRadius: 10,
  },
  keyText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});
