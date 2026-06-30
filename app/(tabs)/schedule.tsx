import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, Dimensions, FlatList, Alert, Platform, Switch, Modal, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

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
  bookingId?: string;
  userId?: string;
}

interface DayAvailability { active: boolean; start: string; end: string; }
interface Availability { monday: DayAvailability; tuesday: DayAvailability; wednesday: DayAvailability; thursday: DayAvailability; friday: DayAvailability; saturday: DayAvailability; sunday: DayAvailability; }

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
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
  const [tasks, setTasks] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tasks' | 'availability'>('tasks');
  const [availability, setAvailability] = useState<Availability>(DEFAULT_AVAILABILITY);
  
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoType, setPhotoType] = useState<'before'|'after'>('before');
  const [currentPhotoTask, setCurrentPhotoTask] = useState<Booking | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  const days = useMemo(() => generateNext7Days(), []);

  useEffect(() => {
    if (!profile?.uid) return;

    // Fetch Date-wise ServiceTasks
    const tasksQuery = query(
      collection(db, 'serviceTasks'),
      where('assignedPartnerId', '==', profile.uid)
    );

    const unsubTasks = onSnapshot(tasksQuery, async (snapshot) => {
      const fetchedTasks: any[] = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (!data.date) continue;
        
        // Fetch parent booking data
        if (data.bookingId) {
          const bDoc = await getDoc(doc(db, 'bookings', data.bookingId));
          if (bDoc.exists()) {
            const bData = bDoc.data();
            fetchedTasks.push({
              ...bData,
              id: docSnap.id,
              bookingId: data.bookingId,
              status: data.status,
              date: data.date,
              serviceName: bData.service || 'Recurring Service'
            });
          }
        }
      }
      setTasks(fetchedTasks);
      setLoading(false);
    });

    const fetchAvailability = async () => {
      const partnerDoc = await getDoc(doc(db, 'partners', profile.uid));
      if (partnerDoc.exists() && partnerDoc.data().availability) {
        setAvailability(partnerDoc.data().availability);
      }
    };
    fetchAvailability();

    return () => unsubTasks();
  }, [profile?.uid]);

  const updateDayAvailability = async (day: string, updates: Partial<DayAvailability>) => {
    if (!profile?.uid) return;
    const newAvailability = { ...availability, [day]: { ...availability[day as keyof Availability], ...updates } };
    setAvailability(newAvailability);
    try { await updateDoc(doc(db, 'partners', profile.uid), { availability: newAvailability }); } 
    catch (error) { Alert.alert('Error', 'Failed to update availability'); }
  };

  const toggleVacation = async () => {
    if (!profile?.uid) return;
    const nextStatus = !profile.vacationMode;
    try {
      await updateDoc(doc(db, 'partners', profile.uid), {
        vacationMode: nextStatus,
        isOnline: !nextStatus
      });
      Alert.alert('Status Updated', nextStatus ? 'Vacation Mode is now ON.' : 'Welcome back! You are now ONLINE.');
    } catch (error) {
      Alert.alert('Error', 'Failed to update vacation status');
    }
  };

  const handleUpdateStatus = async (taskId: string, currentStatus: string) => {
    let nextStatus = '';
    let confirmMsg = '';

    switch (currentStatus) {
      case 'assigned':
      case 'pending_reassignment':
        nextStatus = 'on_the_way';
        confirmMsg = 'Start traveling to the customer location?';
        break;
      case 'on_the_way':
        nextStatus = 'arrived';
        confirmMsg = 'Have you arrived at the location?';
        break;
      case 'arrived':
        nextStatus = 'started';
        confirmMsg = 'Start the service?';
        break;
      case 'started':
        nextStatus = 'completed';
        confirmMsg = 'Mark the service as completed?';
        break;
      default:
        return;
    }

    if (currentStatus === 'arrived') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhotoType('before');
      setCurrentPhotoTask(tasks.find(t => t.id === taskId) || null);
      setShowPhotoModal(true);
      return;
    }

    if (currentStatus === 'started') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhotoType('after');
      setCurrentPhotoTask(tasks.find(t => t.id === taskId) || null);
      setShowPhotoModal(true);
      return;
    }

    Alert.alert('Update Status', confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Confirm', 
        onPress: async () => {
          try {
            await updateDoc(doc(db, 'serviceTasks', taskId), {
              status: nextStatus,
              [`${nextStatus}At`]: new Date().toISOString()
            });
          } catch (error) {
            console.error("Status update error:", error);
            Alert.alert('Error', 'Failed to update status');
          }
        }
      }
    ]);
  };

  const uploadToCloudinary = async (uri: string, folder: string) => {
    try {
      const data = new FormData();
      // @ts-ignore
      data.append('file', { uri, type: 'image/jpeg', name: 'upload.jpg' });
      data.append('upload_preset', process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'snapit');
      data.append('cloud_name', process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dv8v2kniy');
      data.append('folder', folder);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dv8v2kniy'}/image/upload`,
        { method: 'POST', body: data }
      );
      const result = await response.json();
      return result.secure_url;
    } catch (error) {
      throw error;
    }
  };

  const handlePhotoUpload = async () => {
    if (!currentPhotoTask) return;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Sorry, we need camera permissions to make this work!');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.7 });
      if (!result.canceled) {
        setPhotoLoading(true);
        const imageUrl = await uploadToCloudinary(result.assets[0].uri, 'job_verifications');
        const nextStatus = photoType === 'before' ? 'started' : 'completed';
        
        await updateDoc(doc(db, 'serviceTasks', currentPhotoTask.id), {
          status: nextStatus,
          [`${nextStatus}At`]: new Date().toISOString(),
          [`${photoType}Image`]: imageUrl
        });

        setShowPhotoModal(false);
        setPhotoLoading(false);
        setCurrentPhotoTask(null);
        Alert.alert('Success', `Task ${nextStatus === 'started' ? 'started' : 'completed'} successfully!`);
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Error', error.message || 'Failed to upload photo');
      setPhotoLoading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    const dateStr = selectedDate.toDateString();
    return tasks.filter(task => {
      const taskDateStr = new Date(task.date).toDateString();
      return taskDateStr === dateStr && task.status !== 'cancelled';
    });
  }, [tasks, selectedDate]);

  const renderTask = ({ item }: { item: Booking }) => (
    <View style={styles.taskCard}>
      <View style={styles.timeLineContainer}>
        <Text style={styles.timeText}>{item.startTime || '10:00 AM'}</Text>
        <View style={styles.line} />
      </View>
      <View style={styles.taskInfo}>
        <View style={styles.taskHeader}>
          <Text style={styles.taskTitle} numberOfLines={1}>
            {item.serviceName || item.service || item.title || 'Service Call'}
          </Text>
          <View style={styles.recurringBadge}>
            <Ionicons name="repeat" size={10} color="#111827" />
            <Text style={styles.recurringText}>{item.frequency?.toUpperCase() || 'RECURRING'}</Text>
          </View>
        </View>
        <View style={styles.customerRow}><Ionicons name="person-outline" size={14} color="#64748b" /><Text style={styles.customerName}>{item.userName}</Text></View>
        <View style={styles.addressRow}><Ionicons name="location-outline" size={14} color="#64748b" /><Text style={styles.addressText} numberOfLines={1}>{item.userAddress}</Text></View>
        
        <View style={styles.actionRow}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: item.status === 'completed' ? '#10b981' : item.status === 'started' ? '#6366F1' : '#111827' }]} />
            <Text style={styles.statusLabel}>{item.status.replace('_', ' ').toUpperCase()}</Text>
          </View>
          
          {item.status !== 'completed' && (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleUpdateStatus(item.id, item.status)}
            >
              <Text style={styles.actionButtonText}>
                {item.status === 'assigned' || item.status === 'pending_reassignment' ? 'Start Journey' :
                 item.status === 'on_the_way' ? 'Mark Arrived' :
                 item.status === 'arrived' ? 'Start Task (Photo)' : 'Complete (Photo)'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Schedule</Text>
        <TouchableOpacity style={[styles.vacationBtn, profile?.vacationMode && styles.vacationBtnActive]} onPress={toggleVacation}>
          <Text style={[styles.vacationText, profile?.vacationMode && styles.vacationTextActive]}>{profile?.vacationMode ? 'On Vacation' : 'Vacation Mode'}</Text>
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
            <Text style={styles.availInfoText}>Set your working hours for each day. You won't receive tasks outside these hours.</Text>
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
                  <Switch value={dayData.active} onValueChange={(val) => updateDayAvailability(day, { active: val })} trackColor={{ false: "#e2e8f0", true: "#111827" }} />
                </View>
                {dayData.active && (
                  <View style={styles.timeSettings}>
                    <TouchableOpacity style={styles.timePickerBtn} onPress={() => { const times = ['08:00', '09:00', '10:00', '11:00']; const current = times.indexOf(dayData.start); updateDayAvailability(day, { start: times[(current + 1) % times.length] }); }}>
                      <Text style={styles.timeLabel}>Start</Text><Text style={styles.timeVal}>{dayData.start}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.timePickerBtn} onPress={() => { const times = ['17:00', '18:00', '19:00', '20:00']; const current = times.indexOf(dayData.end); updateDayAvailability(day, { end: times[(current + 1) % times.length] }); }}>
                      <Text style={styles.timeLabel}>End</Text><Text style={styles.timeVal}>{dayData.end}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Photo Upload Modal */}
      <Modal visible={showPhotoModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Verification Required</Text>
              <TouchableOpacity onPress={() => setShowPhotoModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.photoInstructions}>
              <View style={styles.photoIconCircle}>
                <Ionicons name="camera" size={32} color="#111827" />
              </View>
              <Text style={styles.photoTitle}>
                {photoType === 'before' ? 'Take Before Photo' : 'Take After Photo'}
              </Text>
              <Text style={styles.photoSubtitle}>
                Please take a clear photo of the service area to proceed to the next step.
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.cameraBtn}
              onPress={handlePhotoUpload}
              disabled={photoLoading}
            >
              {photoLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.cameraBtnText}>Open Camera</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusLabel: { fontSize: 10, fontWeight: '700', color: '#64748b' },
  actionButton: { backgroundColor: '#111827', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  actionButtonText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginBottom: 15, borderWidth: 1, borderColor: '#f1f5f9' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  availabilityList: { padding: 24 },
  availInfoBox: { flexDirection: 'row', backgroundColor: '#f1f5f9', padding: 16, borderRadius: 16, marginBottom: 24, alignItems: 'center' },
  availInfoText: { flex: 1, marginLeft: 12, fontSize: 13, color: '#111827', lineHeight: 18, fontWeight: '500' },
  dayRow: { backgroundColor: '#fff', borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#f1f5f9' },
  dayMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  dayStatusText: { fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: '500' },
  timeSettings: { flexDirection: 'row', marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#f8fafc', gap: 12 },
  timePickerBtn: { flex: 1, backgroundColor: '#f8fafc', padding: 12, borderRadius: 12, alignItems: 'center' },
  timeLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase' },
  timeVal: { fontSize: 15, fontWeight: '800', color: '#1e293b', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, minHeight: 350 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  photoInstructions: { alignItems: 'center', marginBottom: 40 },
  photoIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  photoTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  photoSubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  cameraBtn: { backgroundColor: '#111827', flexDirection: 'row', height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  cameraBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
