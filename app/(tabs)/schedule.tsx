import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  FlatList,
  Alert,
  Platform,
  Switch
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  doc,
  updateDoc,
  getDoc
} from 'firebase/firestore';

const { width } = Dimensions.get('window');

interface Booking {
  id: string;
  serviceName: string;
  userName: string;
  userAddress: string;
  date: string;
  startTime: string;
  status: string;
  frequency: string;
  endDate?: string;
  service?: string;
  title?: string;
  items?: any[];
}

interface DayAvailability {
  active: boolean;
  start: string;
  end: string;
}

interface Availability {
  monday: DayAvailability;
  tuesday: DayAvailability;
  wednesday: DayAvailability;
  thursday: DayAvailability;
  friday: DayAvailability;
  saturday: DayAvailability;
  sunday: DayAvailability;
}

const DAYS_OF_WEEK = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
];

const DEFAULT_AVAILABILITY: Availability = {
  monday: { active: true, start: '09:00', end: '18:00' },
  tuesday: { active: true, start: '09:00', end: '18:00' },
  wednesday: { active: true, start: '09:00', end: '18:00' },
  thursday: { active: true, start: '09:00', end: '18:00' },
  friday: { active: true, start: '09:00', end: '18:00' },
  saturday: { active: true, start: '10:00', end: '16:00' },
  sunday: { active: false, start: '09:00', end: '18:00' },
};

const generateNext7Days = () => {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
};

export default function ScheduleScreen() {
  const { profile } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tasks' | 'availability'>('tasks');
  const [availability, setAvailability] = useState<Availability>(DEFAULT_AVAILABILITY);
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => generateNext7Days(), []);

  // Fetch bookings and partner availability
  useEffect(() => {
    if (!profile?.uid) return;

    // Fetch Bookings
    const q = query(
      collection(db, 'bookings'),
      where('workerId', '==', profile.uid),
      where('status', 'in', ['accepted', 'on_the_way', 'arrived', 'started'])
    );

    const unsubBookings = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Booking[];
      setBookings(fetched);
      setLoading(false);
    });

    // Fetch Availability from partner document
    const fetchAvailability = async () => {
      const partnerDoc = await getDoc(doc(db, 'partners', profile.uid));
      if (partnerDoc.exists() && partnerDoc.data().availability) {
        setAvailability(partnerDoc.data().availability);
      }
    };
    fetchAvailability();

    return () => unsubBookings();
  }, [profile?.uid]);

  const updateDayAvailability = async (day: string, updates: Partial<DayAvailability>) => {
    if (!profile?.uid) return;
    
    const newAvailability = {
      ...availability,
      [day]: { ...availability[day as keyof Availability], ...updates }
    };
    
    setAvailability(newAvailability);
    
    try {
      await updateDoc(doc(db, 'partners', profile.uid), {
        availability: newAvailability
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to update availability');
    }
  };

  const toggleVacation = async () => {
    if (!profile?.uid) return;
    const nextStatus = !profile.vacationMode;
    try {
      await updateDoc(doc(db, 'partners', profile.uid), {
        vacationMode: nextStatus,
        isOnline: !nextStatus // Automatically go offline if vacation mode is ON
      });
      Alert.alert('Status Updated', nextStatus ? 'Vacation Mode is now ON.' : 'Welcome back! You are now ONLINE.');
    } catch (error) {
      Alert.alert('Error', 'Failed to update vacation status');
    }
  };

  const filteredTasks = useMemo(() => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    return bookings.filter(task => {
      const taskStartDate = task.date;
      const taskEndDate = task.endDate || task.date;
      if (dateStr < taskStartDate || (task.endDate && dateStr > taskEndDate)) return false;
      if (!task.frequency || task.frequency === 'one-time') return taskStartDate === dateStr;
      if (task.frequency === 'daily') return true;
      if (task.frequency === 'alternate_days') {
        const diff = Math.floor((new Date(dateStr).getTime() - new Date(taskStartDate).getTime()) / (1000 * 3600 * 24));
        return diff % 2 === 0;
      }
      if (task.frequency === 'weekly') return new Date(taskStartDate).getDay() === new Date(dateStr).getDay();
      return false;
    }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [bookings, selectedDate]);

  const renderTask = ({ item }: { item: Booking }) => (
    <View style={styles.taskCard}>
      <View style={styles.timeLineContainer}>
        <Text style={styles.timeText}>{item.startTime || '10:00 AM'}</Text>
        <View style={styles.line} />
      </View>
      <View style={styles.taskInfo}>
        <View style={styles.taskHeader}>
          <Text style={styles.taskTitle} numberOfLines={1}>
            {item.service || item.serviceName || item.title || (item.items && item.items[0]?.serviceName) || 'Service Call'}
          </Text>
          {item.frequency && item.frequency !== 'one-time' && (
            <View style={styles.recurringBadge}>
              <Ionicons name="repeat" size={10} color="#111827" />
              <Text style={styles.recurringText}>{item.frequency.toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={styles.customerRow}><Ionicons name="person-outline" size={14} color="#64748b" /><Text style={styles.customerName}>{item.userName}</Text></View>
        <View style={styles.addressRow}><Ionicons name="location-outline" size={14} color="#64748b" /><Text style={styles.addressText} numberOfLines={1}>{item.userAddress}</Text></View>
        <View style={styles.statusRow}><View style={[styles.statusDot, { backgroundColor: item.status === 'started' ? '#6366F1' : '#111827' }]} /><Text style={styles.statusLabel}>{item.status.replace('_', ' ').toUpperCase()}</Text></View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Schedule</Text>
        <TouchableOpacity 
          style={[styles.vacationBtn, profile?.vacationMode && styles.vacationBtnActive]}
          onPress={toggleVacation}
        >
          <Text style={[styles.vacationText, profile?.vacationMode && styles.vacationTextActive]}>
            {profile?.vacationMode ? 'On Vacation' : 'Vacation Mode'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === 'tasks' && styles.activeTab]} onPress={() => setActiveTab('tasks')}>
          <Text style={[styles.tabText, activeTab === 'tasks' && styles.activeTabText]}>Daily Tasks</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'availability' && styles.activeTab]} onPress={() => setActiveTab('availability')}>
          <Text style={[styles.tabText, activeTab === 'availability' && styles.activeTabText]}>Work Hours</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'tasks' ? (
        <>
          <View style={styles.dateSelector}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
              {days.map((date, index) => {
                const isSelected = date.toDateString() === selectedDate.toDateString();
                return (
                  <TouchableOpacity key={index} style={[styles.dateCard, isSelected && styles.selectedDateCard]} onPress={() => setSelectedDate(date)}>
                    <Text style={[styles.dayName, isSelected && styles.selectedDateText]}>{date.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                    <Text style={[styles.dateNum, isSelected && styles.selectedDateText]}>{date.getDate()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
          <FlatList
            data={filteredTasks}
            renderItem={renderTask}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.taskList}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}><Ionicons name="calendar-outline" size={48} color="#e2e8f0" /></View>
                <Text style={styles.emptyTitle}>No tasks for today</Text>
              </View>
            }
          />
        </>
      ) : (
        <ScrollView style={styles.availabilityList} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.availInfoBox}>
            <Ionicons name="information-circle" size={20} color="#111827" />
            <Text style={styles.availInfoText}>Set your working hours for each day. You won&apos;t receive tasks outside these hours.</Text>
          </View>

          {DAYS_OF_WEEK.map((day) => {
            const dayData = availability[day as keyof Availability];
            return (
              <View key={day} style={styles.dayRow}>
                <View style={styles.dayMain}>
                  <View>
                    <Text style={styles.dayTitle}>{day.charAt(0).toUpperCase() + day.slice(1)}</Text>
                    <Text style={styles.dayStatusText}>{dayData.active ? `${dayData.start} - ${dayData.end}` : 'Not Available'}</Text>
                  </View>
                  <Switch 
                    value={dayData.active}
                    onValueChange={(val) => updateDayAvailability(day, { active: val })}
                    trackColor={{ false: "#e2e8f0", true: "#111827" }}
                  />
                </View>
                
                {dayData.active && (
                  <View style={styles.timeSettings}>
                    <TouchableOpacity style={styles.timePickerBtn} onPress={() => {
                      // Simple logic to rotate times for demo
                      const times = ['08:00', '09:00', '10:00', '11:00'];
                      const current = times.indexOf(dayData.start);
                      updateDayAvailability(day, { start: times[(current + 1) % times.length] });
                    }}>
                      <Text style={styles.timeLabel}>Start</Text>
                      <Text style={styles.timeVal}>{dayData.start}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.timePickerBtn} onPress={() => {
                      const times = ['17:00', '18:00', '19:00', '20:00'];
                      const current = times.indexOf(dayData.end);
                      updateDayAvailability(day, { end: times[(current + 1) % times.length] });
                    }}>
                      <Text style={styles.timeLabel}>End</Text>
                      <Text style={styles.timeVal}>{dayData.end}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: Platform.OS === 'android' ? 40 : 20, paddingBottom: 20, backgroundColor: '#fff' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1e293b' },
  vacationBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  vacationBtnActive: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  vacationText: { fontSize: 12, color: '#64748b', fontWeight: '700' },
  vacationTextActive: { color: '#fff' },
  tabContainer: { flexDirection: 'row', paddingHorizontal: 24, marginTop: 10, marginBottom: 10, backgroundColor: '#fff' },
  tab: { marginRight: 24, paddingBottom: 12 },
  activeTab: { borderBottomWidth: 3, borderBottomColor: '#111827' },
  tabText: { fontSize: 16, fontWeight: '700', color: '#94a3b8' },
  activeTabText: { color: '#1e293b' },
  dateSelector: { backgroundColor: '#fff', paddingBottom: 20 },
  dateScroll: { paddingHorizontal: 20 },
  dateCard: { width: 60, height: 75, borderRadius: 18, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  selectedDateCard: { backgroundColor: '#111827', borderColor: '#111827' },
  dayName: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  dateNum: { fontSize: 18, fontWeight: '800', color: '#1e293b', marginTop: 2 },
  selectedDateText: { color: '#fff' },
  taskList: { padding: 24 },
  taskCard: { flexDirection: 'row', marginBottom: 24 },
  timeLineContainer: { width: 70, alignItems: 'center' },
  timeText: { fontSize: 12, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  line: { flex: 1, width: 2, backgroundColor: '#e2e8f0', borderRadius: 1 },
  taskInfo: { flex: 1, backgroundColor: '#fff', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#f1f5f9', marginLeft: 5 },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  taskTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b', flex: 1 },
  recurringBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  recurringText: { fontSize: 9, fontWeight: '800', color: '#111827', marginLeft: 3 },
  customerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  customerName: { fontSize: 13, color: '#475569', marginLeft: 8, fontWeight: '600' },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  addressText: { fontSize: 12, color: '#94a3b8', marginLeft: 8, flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusLabel: { fontSize: 10, fontWeight: '700', color: '#64748b' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#f1f5f9' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  availabilityList: { padding: 24 },
  availInfoCard: { flexDirection: 'row', backgroundColor: '#f1f5f9', padding: 16, borderRadius: 16, marginBottom: 24, alignItems: 'center' },
  availInfoText: { flex: 1, marginLeft: 12, fontSize: 13, color: '#111827', lineHeight: 18, fontWeight: '500' },
  dayRow: { backgroundColor: '#fff', borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#f1f5f9' },
  dayMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  dayStatusText: { fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: '500' },
  timeSettings: { flexDirection: 'row', marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#f8fafc', gap: 12 },
  timePickerBtn: { flex: 1, backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, alignItems: 'center' },
  timeLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase' },
  timeVal: { fontSize: 15, fontWeight: '800', color: '#1e293b', marginTop: 4 },
});
