import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Image,
  Platform
} from 'react-native';

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy 
} from 'firebase/firestore';
import { BlurView } from 'expo-blur';

const { width } = Dimensions.get('window');

interface Booking {
  id: string;
  serviceName: string;
  status: string;
  totalAmount: number;
  userName: string;
  userAddress: string;
  date: string;
  startTime: string;
  completedAt?: string;
  items?: any[];
  service?: string;
  title?: string;
  totalPrice?: number;
}

export default function HistoryScreen() {
  const { profile } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(() => {
    if (!profile?.uid) return;

    const q = query(
      collection(db, 'bookings'),
      where('workerId', '==', profile.uid),
      where('status', 'in', ['completed', 'cancelled'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedBookings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Booking[];
      
      // Sort client-side to avoid index requirement
      fetchedBookings.sort((a, b) => {
        const dateA = a.completedAt || '';
        const dateB = b.completedAt || '';
        return dateB.localeCompare(dateA);
      });

      setBookings(fetchedBookings);
      setLoading(false);
      setRefreshing(false);
    });

    return unsubscribe;
  }, [profile?.uid]);

  useEffect(() => {
    const unsubscribe = fetchHistory();
    return () => unsubscribe && unsubscribe();
  }, [fetchHistory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHistory();
    // Safety timeout
    setTimeout(() => setRefreshing(false), 5000);
  }, [fetchHistory]);

  // Earnings hidden for salary model
  // const totalEarnings = bookings
  //   .filter(b => b.status === 'completed')
  //   .reduce((sum, b) => sum + (Number(b.totalAmount || b.totalPrice || 0)), 0);


  const renderHistoryItem = ({ item }: { item: Booking }) => (
    <View style={styles.historyCard}>
      <View style={styles.cardHeader}>
        <View style={styles.serviceInfo}>
          <View style={[styles.iconCircle, { backgroundColor: item.status === 'completed' ? '#f1f5f9' : '#fef2f2' }]}>
            <Ionicons 
              name={item.status === 'completed' ? "checkmark-done" : "close-circle"} 
              size={20} 
              color={item.status === 'completed' ? "#111827" : "#ef4444"} 
            />
          </View>
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.serviceName}>
              {item.service || item.serviceName || item.title || (item.items && item.items[0]?.serviceName) || 'Service Call'}
            </Text>
            <Text style={styles.bookingIdText}>ID: #{item.id.slice(-8).toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <View style={styles.cardDivider} />

      <View style={styles.cardDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="person-outline" size={14} color="#64748b" />
          <Text style={styles.detailText}>{item.userName}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={14} color="#64748b" />
          <Text style={styles.detailText}>
            {item.date || (item.items && item.items[0]?.date) || 'No Date'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={14} color="#64748b" />
          <Text style={styles.detailText} numberOfLines={1}>{item.userAddress}</Text>
        </View>
        {/* Price hidden for salary model */}
        {/* <View style={styles.detailRow}>
          <Ionicons name="cash-outline" size={14} color="#64748b" />
          <Text style={styles.detailText}>₹{item.totalAmount || item.totalPrice || 0}</Text>
        </View> */}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Task History</Text>
        <TouchableOpacity style={styles.filterBtn}>
          <Ionicons name="options-outline" size={20} color="#1e293b" />
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Tasks</Text>
          <Text style={styles.statValue}>{bookings.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Completed</Text>
          <Text style={styles.statValue}>{bookings.filter(b => b.status === 'completed').length}</Text>
        </View>
      </View>


      <FlatList
        data={bookings}
        renderItem={renderHistoryItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#111827']} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="receipt-outline" size={48} color="#e2e8f0" />
              </View>
              <Text style={styles.emptyTitle}>No history yet</Text>
              <Text style={styles.emptySubtitle}>Completed tasks will appear here.</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingBottom: 20,
    backgroundColor: '#fff',
  },

  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1e293b',
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#111827',
    padding: 20,
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginTop: 4,
  },
  listContent: {
    padding: 24,
    paddingBottom: 40,
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  bookingIdText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '600',
  },
  amountText: {
    fontSize: 16,
    fontWeight: '800',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 16,
  },
  cardDetails: {
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 13,
    color: '#64748b',
    marginLeft: 10,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 100,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 6,
  },
});
