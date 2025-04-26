import React, {useState, useRef, useMemo} from 'react';
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
import {useStatusStore} from '../utils/statusStore';
import TooltipContent from './TooltipContent';
import PopupModal from './PopupModal';
import {useCurrentSectionStore} from '../utils/useCurrentSectionStore';

if (UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const HEADER_ELEMENTS = [
  {title: 'dps', icon: FanIcon},
  {title: 'lamp', icon: LampIcon},
  {title: 'pressure', icon: GridIcon},
  {title: 'cleaning', icon: CleaningIcon},
];

const Header = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const currentPage = route.name;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [password, setPassword] = useState(['', '', '', '']);
  const {setCurrentSectionId} = useCurrentSectionStore();

  const getSectionStatusSummary = useStatusStore(
    state => state.getSectionStatusSummary,
  );

  const handleKeyPress = (key: string | number) => {
    let newPassword = [...password];

    if (key === 'DEL') {
      let lastFilledIndex = newPassword.length - 1;
      while (lastFilledIndex >= 0 && newPassword[lastFilledIndex] === '') {
        lastFilledIndex--;
      }

      if (lastFilledIndex >= 0) {
        newPassword[lastFilledIndex] = '';
      }
    } else {
      const firstEmptyIndex = newPassword.findIndex(p => p === '');
      if (firstEmptyIndex !== -1) {
        newPassword[firstEmptyIndex] = key.toString();
      }
    }

    setPassword(newPassword);

    if (newPassword.join('') === '3536') {
      if (NativeModules.KioskModule) {
        NativeModules.KioskModule.stopKioskMode();
      }
      setIsModalVisible(false);
    }
  };

  const elements = useMemo(() => {
    return HEADER_ELEMENTS.map(item => {
      const summary = getSectionStatusSummary(item.title);
      const errorCount = summary.filter(s => s?.status === 'error').length;
      const warningCount = summary.filter(s => s?.status === 'warning').length;
      return {
        ...item,
        summary,
        errorCount,
        warningCount,
        status:
          errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'good',
      };
    });
  }, [getSectionStatusSummary]);

  const errorCount = elements.reduce((sum, item) => sum + item.errorCount, 0);
  const warningCount = elements.reduce(
    (sum, item) => sum + item.warningCount,
    0,
  );

  const [tooltip, setTooltip] = useState<{
    title: string;
    index: number;
    position: {x: number; y: number};
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
                x: pageX + width / 2,
                y: pageY + height,
              },
            },
      );
    });
  };

  const closeTooltip = () => {
    setTooltip(null);
  };

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
            onPress={() => {
              navigation.navigate('Home' as never);
              setCurrentSectionId(null);
            }}>
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
            onPress={() => {
              navigation.navigate('Settings' as never);
              setCurrentSectionId(null);
            }}>
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
                          {
                            backgroundColor:
                              item.errorCount > 0
                                ? COLORS.error[500]
                                : item.warningCount > 0
                                ? COLORS.warning[500]
                                : COLORS.good[500],
                          },
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
                            ? item.errorCount > 0
                              ? COLORS.error[500]
                              : item.warningCount > 0
                              ? COLORS.warning[500]
                              : COLORS.good[500]
                            : '#fff'
                        }
                        stroke={
                          item.title === 'pressure'
                            ? item.errorCount > 0
                              ? COLORS.error[500]
                              : item.warningCount > 0
                              ? COLORS.warning[500]
                              : COLORS.good[500]
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
                  setCurrentSectionId(null);
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
                <CheckIcon fill={'#fff'} style={styles.checkIcon} />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>

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
                    left: tooltip.position.x - 150,
                  },
                ]}>
                <View style={styles.tooltipTriangle} />
                <View style={styles.tooltipContent}>
                  <TooltipContent
                    type={tooltip.title}
                    statusSummary={
                      elements.find(e => e.title === tooltip.title)?.summary ||
                      []
                    }
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
    fontSize: 12,
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

export default Header;
