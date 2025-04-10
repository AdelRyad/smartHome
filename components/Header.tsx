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
  InfoIcon,
  FanIcon,
  Settings2Icon,
} from '../icons';
import {useNavigation, useRoute} from '@react-navigation/native';
import {COLORS} from '../constants/colors';

if (UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const Header = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const currentPage = route.name;

  type Status = 'good' | 'warning' | 'error';

  const elements = [
    {title: 'fan', icon: FanIcon, status: 'good' as Status},
    {title: 'lamp', icon: LampIcon, status: 'warning' as Status},
    {title: 'grid', icon: GridIcon, status: 'good' as Status},
    {title: 'door', icon: DoorIcon, status: 'error' as Status},
    {title: 'cleaning', icon: CleaningIcon, status: 'good' as Status},
  ];

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
                x: pageX + width / 2, // Start at center
                y: pageY + height + 5, // Position below icon
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
      <TouchableOpacity
        onLongPress={() => {
          if (NativeModules.KioskModule) {
            NativeModules.KioskModule.stopKioskMode();
          }
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
                        {item.status === 'good' ? (
                          <CheckIcon fill="#fff" style={styles.checkIcon} />
                        ) : (
                          <Text style={styles.statusText}>2</Text>
                        )}
                      </View>
                      <item.icon
                        fill={
                          item.title !== 'grid'
                            ? COLORS[item.status][500]
                            : '#fff'
                        }
                        stroke={
                          item.title === 'grid' ? COLORS[item.status][500] : ''
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
              <TouchableOpacity style={styles.warningButton}>
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
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeTooltip}>
          {tooltip && (
            <View
              style={[
                styles.tooltipContainer,
                {
                  top: tooltip.position.y - 20,
                  left: tooltip.position.x - 150, // Adjust based on tooltip width
                },
              ]}>
              <View style={styles.tooltipTriangle} />
              <View style={styles.tooltipContent}>
                <InfoIcon stroke={COLORS.teal[500]} />
                <View>
                  <Text style={styles.tooltipText}>{tooltip.title}</Text>
                  <Text style={styles.tooltipText}>{tooltip.title}</Text>
                </View>
              </View>
            </View>
          )}
        </TouchableOpacity>
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
    borderBottomColor: '#333',
    alignSelf: 'center',
    marginBottom: -1,
  },
  tooltipContent: {
    backgroundColor: '#333',
    padding: 10,
    borderRadius: 6,
    flexDirection: 'row',
    gap: 10,
    width: 300,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 12,
  },
});
