import React from 'react';
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
import {EditIcon, LampIcon} from '../../icons';
import {useWindowDimensions} from 'react-native';

const Settings = () => {
  const {width, height} = useWindowDimensions();
  const isPortrait = height > width;

  // Data for the scrollable list
  const scrollData = Array.from({length: 10}, (_, index) => ({
    id: index + 1,
    text: `SEF-UV-9.9A-S1`,
  }));

  // Data for the grid
  const gridData = Array.from({length: 6}, (_, index) => ({
    id: index + 1,
    title: `UVC ${index + 1}`,
    daysLeft: 32,
  }));

  // Render item for the scrollable list
  const renderScrollItem = ({item}: {item: {id: number; text: string}}) => (
    <TouchableOpacity style={styles.scrollItem}>
      <Text style={styles.scrollItemText}>{item.text}</Text>
    </TouchableOpacity>
  );

  // Render item for the grid
  const renderGridItem = ({
    item,
  }: {
    item: {title: string; daysLeft: number};
  }) => (
    <View style={styles.gridItem}>
      <View style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrapper}>
              <LampIcon fill={'black'} style={styles.cardIcon} />
            </View>
            <TextInput
              style={styles.cardTitleInput}
              placeholder="Enter text"
              defaultValue={item.title}
            />
          </View>
          <TextInput
            style={styles.cardInput}
            placeholder="Enter text"
            defaultValue={item.title}
          />
        </View>
      </View>
    </View>
  );

  return (
    <Layout>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerTab}>
          <TouchableOpacity style={styles.tabButton}>
            <LampIcon fill={'black'} style={styles.tabIcon} />
            <Text style={styles.tabText}>Lamp Life</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.container}>
        {/* Left Side - Scrollable List */}
        <View style={styles.leftContainer}>
          <View style={styles.scrollContainer}>
            <FlatList
              data={scrollData}
              renderItem={renderScrollItem}
              keyExtractor={item => item.id.toString()}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
        {/* Right Side - Grid */}
        <View style={styles.gridContainer}>
          <FlatList
            key={isPortrait ? 'portrait' : 'landscape'} // Forces re-render
            numColumns={isPortrait ? 1 : 3}
            data={gridData}
            renderItem={renderGridItem}
            keyExtractor={item => item.id.toString()}
            columnWrapperStyle={isPortrait ? null : styles.gridColumnWrapper}
            contentContainerStyle={styles.gridContentContainer}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerButton}>
          <EditIcon />
          <Text style={styles.footerButtonText}>Edit Lamp Life</Text>
        </TouchableOpacity>
      </View>
    </Layout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    gap: 32,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  leftContainer: {
    width: 250,
    flexDirection: 'column',
    gap: 12,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  scrollItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.gray[200],
  },
  scrollItemText: {
    color: COLORS.gray[700],
    fontSize: 21,
    fontWeight: '500',
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
  headerTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    backgroundColor: COLORS.gray[25],
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.gray[200],
  },
  tabIcon: {
    width: 28,
    height: 28,
  },
  tabText: {
    fontSize: 20,
    fontWeight: '500',
    color: COLORS.gray[950],
  },
  gridContainer: {
    flex: 1,
  },
  gridContentContainer: {
    gap: 16,
    flexGrow: 1,
  },
  gridItem: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 30,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 5,
    minHeight: 210,
  },
  gridColumnWrapper: {
    gap: 16,
    justifyContent: 'space-between',
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardIconWrapper: {
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 1000,
    padding: 16,
  },
  cardIcon: {
    width: 24,
    height: 24,
  },
  cardTitleInput: {
    fontSize: 24,
    fontWeight: '600',
  },
  cardInput: {
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
  footer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  footerButton: {
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
  footerButtonText: {
    fontSize: 24,
    fontWeight: '600',
  },
});

export default Settings;
