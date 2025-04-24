import React, {useEffect, useState, useMemo, memo, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import Layout from '../../components/Layout';
import {COLORS} from '../../constants/colors';
import {
  CalednarIocn,
  CallIcon,
  MailIcon,
  QrCode,
  QRIcon,
  RefrenceIcon,
} from '../../icons';
import {getContactInfo} from '../../utils/db';

// Define the ContactField type
type ContactField = {
  key: string;
  title: string;
  icon: React.ComponentType<any>;
  type: string;
};

type ContactInfo = {
  email?: string;
  phone?: string;
  project_refrence?: string;
  hood_refrence?: string;
  commission_date?: string;
};

// Memoized components
const ContactCard = memo(
  ({
    item,
    contactInfo,
  }: {
    item: ContactField;
    contactInfo: ContactInfo | null;
  }) => {
    const value = contactInfo ? contactInfo[item.key as keyof ContactInfo] : '';

    return (
      <View style={styles.gridItem}>
        <View style={styles.card}>
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrapper}>
                <RefrenceIcon fill={'black'} style={styles.cardIcon} />
              </View>
              <Text style={styles.cardSubText}>{item.title}</Text>
            </View>
            <Text style={styles.cardTitle}>
              {item.type === 'date' && value
                ? new Date(value).toLocaleDateString()
                : value}
            </Text>
          </View>
        </View>
      </View>
    );
  },
);

const EmailCard = memo(({email}: {email?: string}) => (
  <View style={[styles.gridItem, styles.emailCard]}>
    <View style={styles.card}>
      <View style={styles.emailCardContent}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrapper}>
            <MailIcon fill={'black'} style={styles.cardIcon} />
          </View>
          <Text style={styles.cardSubText}>Email Address</Text>
        </View>
        <Text style={styles.cardTitle}>{email}</Text>
      </View>
    </View>
  </View>
));

const QRCodeSection = memo(() => (
  <View style={styles.qrCodeContainer}>
    <View style={styles.qrCodeBorderTop}>
      <View style={styles.qrCodeCornerLeft} />
      <View style={styles.qrCodeCornerRight} />
    </View>
    <View style={styles.qrCodeWrapper}>
      <QrCode />
    </View>
    <View style={styles.qrCodeBorderBottom}>
      <View
        style={[styles.qrCodeCornerLeft, {transform: [{rotate: '-90deg'}]}]}
      />
      <View
        style={[styles.qrCodeCornerRight, {transform: [{rotate: '90deg'}]}]}
      />
    </View>
    <View style={styles.qrCodeLine} />
  </View>
));

const QRCodeInfo = memo(() => (
  <View style={styles.qrCodeInfo}>
    <View style={styles.cardIconWrapper}>
      <QRIcon fill={'black'} style={styles.cardIcon} />
    </View>
    <View style={styles.qrCodeTextContainer}>
      <Text style={styles.cardTitle}>QR Code</Text>
      <Text style={styles.cardSubText}>Scan QR code to reach out to us</Text>
    </View>
  </View>
));

const ContactUsScreen = () => {
  const {width, height} = useWindowDimensions();
  const isPortrait = height > width;
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);

  useEffect(() => {
    getContactInfo(contact => setContactInfo(contact));
  }, []);

  // Memoize contact fields to prevent recreation on every render
  const contactFields = useMemo(
    () => [
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
    ],
    [],
  );

  const renderGridItem = useCallback(
    ({item}: {item: ContactField}) => (
      <ContactCard item={item} contactInfo={contactInfo} />
    ),
    [contactInfo],
  );

  return (
    <Layout>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Contact</Text>
        <Text style={styles.headerSubText}>
          Use contact information below to get help quickly
        </Text>
      </View>
      <View
        style={[
          styles.container,
          {flexDirection: isPortrait ? 'column-reverse' : 'row'},
        ]}>
        <View style={styles.gridContainer}>
          <FlatList
            key={isPortrait ? 'portrait' : 'landscape'}
            numColumns={isPortrait ? 1 : 2}
            data={contactFields}
            renderItem={renderGridItem}
            keyExtractor={item => item.key}
            columnWrapperStyle={isPortrait ? null : styles.gridColumnWrapper}
            contentContainerStyle={styles.gridContentContainer}
            showsVerticalScrollIndicator={false}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={5}
          />
          <EmailCard email={contactInfo?.email} />
        </View>
        <View style={[styles.scrollContainer, {flex: 1, gap: 56}]}>
          <QRCodeSection />
          <QRCodeInfo />
        </View>
      </View>
    </Layout>
  );
};

// Styles remain the same as in your original code
const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
  },
  header: {
    paddingHorizontal: 32,
  },
  headerTitle: {
    fontSize: 40,
    fontWeight: '500',
  },
  headerSubText: {
    fontSize: 20,
    color: COLORS.gray[600],
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
    marginRight: 32,
  },
  gridContainer: {
    width: '60%',
  },
  gridContentContainer: {
    gap: 16,
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  gridItem: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 5,
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
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  cardIconWrapper: {
    borderWidth: 1,
    borderColor: COLORS.gray[100],
    borderRadius: 1000,
    padding: 12,
  },
  cardIcon: {
    width: 24,
    height: 24,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  cardSubText: {
    fontSize: 20,
    color: COLORS.gray[600],
  },
  emailCard: {
    marginHorizontal: 32,
    maxHeight: 90,
  },
  emailCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 20,
    flex: 1,
  },
  qrCodeContainer: {
    alignSelf: 'center',
    position: 'relative',
  },
  qrCodeBorderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qrCodeBorderBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qrCodeCornerLeft: {
    borderLeftWidth: 3,
    borderTopWidth: 3,
    borderColor: COLORS.teal[500],
    borderTopLeftRadius: 6,
    width: 20,
    height: 20,
  },
  qrCodeCornerRight: {
    borderRightWidth: 3,
    borderTopWidth: 3,
    borderColor: COLORS.teal[500],
    borderTopRightRadius: 6,
    width: 20,
    height: 20,
  },
  qrCodeWrapper: {
    paddingHorizontal: 20,
  },
  qrCodeLine: {
    position: 'absolute',
    top: '50%',
    transform: [{translateY: '-50%'}, {translateX: '50%'}],
    right: '25%',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(21, 183, 159, 0.4)',
    shadowColor: COLORS.teal[500],
    shadowOffset: {width: 0, height: 20},
    shadowOpacity: 0.2,
    shadowRadius: 60,
    elevation: 5,
  },
  qrCodeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qrCodeTextContainer: {
    gap: 10,
  },
});

export default memo(ContactUsScreen);
