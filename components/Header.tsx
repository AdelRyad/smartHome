import React, {useState, useRef, useMemo, useCallback} from 'react';
import {
  View,
  StyleSheet,
  Pressable,
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
} from '../icons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {COLORS} from '../constants/colors';
import {useStatusStore} from '../utils/statusStore';
import TooltipContent from './TooltipContent';
import {useCurrentSectionStore} from '../utils/useCurrentSectionStore';
import HeaderStatusIcon from './HeaderStatusIcon';
import PasswordModal from './PasswordModal';

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

  const handleKeyPress = useCallback(
    (key: string | number) => {
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
    },
    [password],
  );

  // Memoize elements and counts to avoid recalculation on every render
  const elements = useMemo(() => {
    return HEADER_ELEMENTS.map(item => {
      const summary = getSectionStatusSummary(
        item.title as 'dps' | 'pressure' | 'cleaning' | 'lamp',
      );
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

  const errorCount = useMemo(
    () => elements.reduce((sum, item) => sum + item.errorCount, 0),
    [elements],
  );
  const warningCount = useMemo(
    () => elements.reduce((sum, item) => sum + item.warningCount, 0),
    [elements],
  );

  const [tooltip, setTooltip] = useState<{
    title: string;
    index: number;
    position: {x: number; y: number};
  } | null>(null);

  const iconRefs = useRef<(View | null)[]>([]);

  // Memoize handlePress to avoid re-creating on every render
  const handlePress = useCallback((index: number, title: string) => {
    const iconRef = iconRefs.current[index];
    if (!iconRef) {
      return;
    }
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
  }, []);

  const closeTooltip = () => {
    setTooltip(null);
  };

  // Memoize navigation handlers
  const handleNavigateHome = useCallback(() => {
    navigation.navigate('Home' as never);
    setCurrentSectionId(null);
  }, [navigation, setCurrentSectionId]);

  const handleNavigateSettings = useCallback(() => {
    navigation.navigate('Settings' as never);
    setCurrentSectionId(null);
  }, [navigation, setCurrentSectionId]);

  const handleNavigateContact = useCallback(() => {
    navigation.navigate('ContactUs' as never);
    setCurrentSectionId(null);
  }, [navigation, setCurrentSectionId]);

  return (
    <View style={styles.header}>
      <PasswordModal
        visible={isModalVisible}
        password={password}
        onClose={() => {
          setIsModalVisible(false);
        }}
        onKeyPress={handleKeyPress}
        styles={styles}
      />
      <Pressable
        onLongPress={() => {
          setIsModalVisible(true);
          setPassword(['', '', '', '']);
        }}
        delayLongPress={5000}
        style={({pressed}) => pressed && {opacity: 0.7}}>
        <Logo />
      </Pressable>
      <View style={styles.nav}>
        <View style={styles.navLinks}>
          <Pressable
            style={({pressed}) => [
              styles.link,
              currentPage === 'Home' && styles.activeLink,
              pressed && {opacity: 0.7},
            ]}
            onPress={handleNavigateHome}>
            {currentPage === 'Home' ? <HomeIcon /> : <InActiveHomeIcon />}
          </Pressable>
          <Pressable
            style={({pressed}) => [
              styles.link,
              currentPage !== 'ContactUs' &&
                currentPage !== 'Home' &&
                currentPage !== 'Section' &&
                styles.activeLink,
              pressed && {opacity: 0.7},
            ]}
            onPress={handleNavigateSettings}>
            {currentPage !== 'ContactUs' &&
            currentPage !== 'Home' &&
            currentPage !== 'Section' ? (
              <Settings2Icon />
            ) : (
              <SettingsIcon />
            )}
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollViewContent}>
          <View style={styles.control}>
            <View style={styles.status}>
              {elements.map((item, index) => (
                <HeaderStatusIcon
                  key={index}
                  item={item}
                  index={index}
                  iconRef={el => (iconRefs.current[index] = el as View | null)}
                  onPress={handlePress}
                  styles={styles}
                />
              ))}
            </View>
            <View style={styles.actions}>
              <Pressable
                style={({pressed}) => [
                  styles.supportButton,
                  {
                    backgroundColor:
                      currentPage === 'ContactUs' ? COLORS.teal[500] : '#fff',
                  },
                  pressed && {opacity: 0.7},
                ]}
                onPress={handleNavigateContact}>
                <CustomerServiceIcon
                  fill={currentPage === 'ContactUs' ? '#fff' : '#000'}
                  width={30}
                  height={30}
                />
              </Pressable>
              <View
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
              </View>
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
