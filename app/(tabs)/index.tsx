import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator, 
  RefreshControl,
  Image,
  Linking,
  Alert,
  ScrollView,
  Dimensions,
  SafeAreaView,
  KeyboardAvoidingView
, Modal, Platform, Pressable, TextInput, Vibration } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useAuth } from '../../context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { db, auth } from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  doc, 
  updateDoc, 
  onSnapshot,
  orderBy
} from 'firebase/firestore';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { socketService } from '../../lib/socket';
// import * as Notifications from 'expo-notifications'; // Disabled for Expo Go compatibility
import { addDoc, serverTimestamp } from 'firebase/firestore';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';


// Local notifications handler for foreground display
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});



const { width, height } = Dimensions.get('window');

const notifyCustomer = async (userId: string, title: string, body: string) => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    const userData = userDoc.data();
    if (userData?.pushToken) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: userData.pushToken,
          sound: 'default',
          title,
          body,
          data: { userId },
        }),
      });
      console.log('Push notification sent to', userData.pushToken);
    } else {
      console.log('No push token for user', userId);
    }
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};


interface Booking {
  id: string;
  serviceName: string;
  serviceId: string;
  totalAmount: number;
  paymentStatus: string;
  paymentMethod?: string;
  totalPrice?: number;
  status: 'pending' | 'accepted' | 'on_the_way' | 'arrived' | 'started' | 'completed' | 'cancelled';
  scheduledDate?: string;
  scheduledTime?: string;
  date?: string;
  startTime?: string;
  time?: string;
  slot?: string;
  selectedSlot?: string;
  userName: string;


  userPhone: string;
  userAddress: string;
  items: any[];
  workerId: string;
  createdAt: any;
  isUrgent?: boolean;
  service?: string;
  title?: string;
  address?: string;
  bookingType?: string;
  location?: any;
  latitude?: number;
  longitude?: number;
  name?: string;
  price?: number;
  messageText?: string;
  isTask?: boolean;
  taskId?: string;
}

export default function PartnerHome() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'instant' | 'assigned'>('instant');
  const [standardBookings, setStandardBookings] = useState<Booking[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [availableBookings, setAvailableBookings] = useState<Booking[]>([]);
  const [partnerCoords, setPartnerCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [stats, setStats] = useState({
    todayEarnings: 0,
    totalTasks: 0,
    rating: profile?.averageRating ? Number(profile.averageRating).toFixed(1) : "0.0"
  });
  
  const [scheduleCount, setScheduleCount] = useState(0);
  
  // Uber-style incoming booking states
  const [isOnline, setIsOnline] = useState(profile?.isOnline || false);
  
  const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const filteredAvailableJobs = React.useMemo(() => {
    return availableBookings.filter(job => {
      if (job.bookingType !== 'instant') return false;
      const jobLat = job.location?.lat || job.latitude;
      const jobLng = job.location?.lng || job.longitude;
      if (!jobLat || !jobLng) return true;
      if (!partnerCoords) return true;
      const dist = getDistanceKm(partnerCoords.latitude, partnerCoords.longitude, jobLat, jobLng);
      return dist <= 10.0 || (dist >= 10000.0 && dist <= 15000.0);
    });
  }, [availableBookings, partnerCoords]);

  const getJobDistanceText = () => {
    if (!activeRequest || !partnerCoords) return "Distance: N/A";
    const jobLat = activeRequest.location?.lat || activeRequest.latitude;
    const jobLng = activeRequest.location?.lng || activeRequest.longitude;
    if (!jobLat || !jobLng) return "Location matched";
    const dist = getDistanceKm(partnerCoords.latitude, partnerCoords.longitude, jobLat, jobLng);
    return `${dist.toFixed(1)} km away`;
  };

  const [activeRequest, setActiveRequest] = useState<any>(null);
  const [declinedRequests, setDeclinedRequests] = useState<{ id: string; declinedAt: number }[]>([]);
  const [countdown, setCountdown] = useState(25);
  const [debugLog, setDebugLog] = useState<string>("Initializing...");

  // Uber-style UI State
  const [incomingJob, setIncomingJob] = useState<any>(null);
  const [incomingCountdown, setIncomingCountdown] = useState(30);
  const alarmSoundRef = useRef<Audio.Sound | null>(null);

  const stopIncomingAlarm = async () => {
    Vibration.cancel();
    if (alarmSoundRef.current) {
      try {
        await alarmSoundRef.current.stopAsync();
        await alarmSoundRef.current.unloadAsync();
      } catch (e) {}
      alarmSoundRef.current = null;
    }
  };

  const handleAcceptIncoming = async () => {
    if (!incomingJob) return;
    const jobId = incomingJob.bookingId;
    await stopIncomingAlarm();
    setIncomingJob(null);
    handleAcceptBooking(jobId);
  };

  const handleRejectIncoming = async () => {
    await stopIncomingAlarm();
    setIncomingJob(null);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (incomingJob && incomingCountdown > 0) {
      interval = setInterval(() => {
        setIncomingCountdown(prev => prev - 1);
      }, 1000);
    } else if (incomingJob && incomingCountdown <= 0) {
      handleRejectIncoming(); // Auto-reject on timeout
    }
    return () => clearInterval(interval);
  }, [incomingJob, incomingCountdown]);

  
  useEffect(() => {
    setStats(prev => ({
      ...prev,
      rating: profile?.averageRating ? Number(profile.averageRating).toFixed(1) : "0.0"
    }));
  }, [profile?.averageRating]);

  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [currentPhotoBooking, setCurrentPhotoBooking] = useState<Booking | null>(null);
  const [photoType, setPhotoType] = useState<'before' | 'after'>('before');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatBooking, setChatBooking] = useState<Booking | null>(null);

  const uploadToCloudinary = async (uri: string, folder: string) => {
    try {
      const data = new FormData();
      // @ts-ignore
      data.append('file', {
        uri,
        type: 'image/jpeg',
        name: 'upload.jpg',
      });
      data.append('upload_preset', process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'snapit');
      data.append('cloud_name', process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dv8v2kniy');
      data.append('folder', folder);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dv8v2kniy'}/image/upload`,
        {
          method: 'POST',
          body: data,
        }
      );
      const result = await response.json();
      return result.secure_url;
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      Alert.alert('Upload Failed', 'Could not upload image. Please try again.');
      return null;
    }
  };

  const fetchBookings = useCallback(() => {
    if (!profile?.uid) return;

    // Query 1: Assigned Bookings
    const assignedQuery = query(
      collection(db, 'bookings'),
      where('workerId', '==', profile.uid)
    );

    // Query 2: Available Bookings (Nearby)
    const availableQuery = query(
      collection(db, 'bookings'),
      where('status', '==', 'searching')
    );

    const unsubAssigned = onSnapshot(assignedQuery, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Booking[];
      // Filter out parent recurring bookings since we handle them via serviceTasks
      const standard = fetched.filter(b => b.bookingType !== 'recurring');
      standard.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setStandardBookings(standard);
      setLoading(false);
    });

    const tasksQuery = query(
      collection(db, 'serviceTasks'),
      where('assignedPartnerId', '==', profile.uid)
    );
    const unsubTasks = onSnapshot(tasksQuery, (snapshot) => {
      let count = 0;
      const todayStr = new Date().toDateString();
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.date) {
          const taskDateStr = new Date(data.date).toDateString();
          if (taskDateStr === todayStr && data.status !== 'completed' && data.status !== 'cancelled') {
            count++;
          }
        }
      });
      setScheduleCount(count);
    });

    return () => {
      unsubAssigned();
      unsubTasks();
    };
  }, [profile?.uid]);

  useEffect(() => {
    const combined = [...standardBookings];
    combined.sort((a: any, b: any) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });
    setBookings(combined);

    const completed = combined.filter(b => b.status === 'completed');
    setStats(prev => ({ ...prev, totalTasks: completed.length }));
  }, [standardBookings]);

  // Socket & Location Initialization
  useEffect(() => {
    if (!profile?.uid) return;

    // Connect socket with authentication
    const initSocket = async () => {
      try {
        const token = await profile?.uid ? (await auth.currentUser?.getIdToken(true)) : undefined;
        socketService.connect(token);
      } catch (error) {
        console.error('Error getting auth token for socket:', error);
        socketService.connect(); // Fallback without token
      }
    };

    initSocket();
    const socket = socketService.getSocket();

    if (socket) {
      socket.emit('register', {
        id: profile.uid,
        name: profile.firstName,
        role: 'partner',
        isOnline: isOnline
      });

      socket.on('newBookingRequest', async (data) => {
        // Check if this partner is in the target list
        if (!data.targetPartnerIds || !data.targetPartnerIds.includes(profile.uid)) return;

        const isUrgent = !!data.isUrgent;
        const myDistanceData = data.distances?.find((d: any) => d.partnerId === profile.uid);
        const distanceStr = myDistanceData ? Number(myDistanceData.distance).toFixed(1) + 'km' : 'nearby';
        const etaStr = myDistanceData && myDistanceData.eta ? `(ETA: ${myDistanceData.eta} mins)` : '';

        // Schedule background notification (fallback if app is closed or backgrounded)
        try {
          const vibEnabled = await AsyncStorage.getItem('notification_vibration');
          const shouldVibrate = vibEnabled !== 'false';

          if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('booking-requests', {
              name: 'New Bookings',
              importance: Notifications.AndroidImportance.MAX,
              vibrationPattern: shouldVibrate ? [0, 500, 200, 500] : undefined,
              lightColor: '#4F46E5',
              sound: 'default', 
            });
          }

          await Notifications.scheduleNotificationAsync({
            content: {
              title: isUrgent ? "🚨 URGENT Job Nearby!" : "New Job Nearby! 📍",
              body: `${data.serviceName || 'A new service'} is requested ${distanceStr} away.`,
              sound: true,
              autoDismiss: false,
            },
            trigger: null,
          });
        } catch (e) {
          console.error("Notification failed", e);
        }

        // Trigger Foreground Uber-style UI
        setIncomingJob({ ...data, distanceStr, etaStr });
        setIncomingCountdown(30);

        try {
          const vibEnabled = await AsyncStorage.getItem('notification_vibration');
          if (vibEnabled !== 'false') {
            Vibration.vibrate([1000, 1000, 1000, 1000], true); // true = repeat indefinitely until canceled
          }

          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });

          // Play reliable remote alarm sound to bypass Metro asset issues
          const { sound } = await Audio.Sound.createAsync(
            { uri: 'https://cdn.pixabay.com/download/audio/2021/08/09/audio_dc39bde907.mp3?filename=emergency-alarm-with-reverb-29431.mp3' }
          );
          
          await sound.setIsLoopingAsync(true); // Loop continuously
          await sound.setVolumeAsync(1.0);
          await sound.playAsync();
          alarmSoundRef.current = sound;
        } catch (e: any) {
          console.error("Audio playback failed", e);
          Alert.alert("Audio System Error", "Failed to play sound: " + e?.message);
        }
      });

      socket.on('bookingAcceptedSuccess', ({ bookingId }) => {
        Alert.alert("Success! 🎉", "Job assigned to you. Start when ready.");
      });

      socket.on('acceptBookingError', ({ message }) => {
        Alert.alert("Failed", message || "Could not accept job. It might have been taken.");
      });
    }

    // Live Location Tracking
    let locationWatcher: any;

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationWatcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        (location) => {
          const { latitude, longitude } = location.coords;
          setPartnerCoords({ latitude, longitude });
          // Emit location to server (Commented out until backend ready)
          socketService.emit('updateLocation', {
            partnerId: profile.uid,
            latitude,
            longitude,
            isOnline: isOnline
          });
        }
      );
    };

    if (isOnline) {
      startTracking();
    } else {
      if (locationWatcher) locationWatcher.remove();
    }

    return () => {
      if (locationWatcher) locationWatcher.remove();
      // socketService.getSocket()?.off('newNearbyBooking');
    };
  }, [profile?.uid, isOnline]);

  useEffect(() => {
    const unsubscribe = fetchBookings();
    return () => unsubscribe && unsubscribe();
  }, [fetchBookings]);

  // Listen to new available bookings and trigger the Uber-style modal
  useEffect(() => {
    console.log("[ModalTrigger] filteredAvailableJobs:", filteredAvailableJobs.map(j => j.id));
    console.log("[ModalTrigger] declinedRequests:", declinedRequests);
    
    // Find next job that was not declined within the last 2 minutes
    const nextJob = filteredAvailableJobs.find(job => {
      const declineRecord = declinedRequests.find(d => d.id === job.id);
      if (declineRecord) {
        const timePassed = Date.now() - declineRecord.declinedAt;
        return timePassed > 120000; // 2 minutes (120,000 ms)
      }
      return true;
    });
    console.log("[ModalTrigger] nextJob selected:", nextJob?.id);
    
    const statusMsg = `DB=${availableBookings.length} | Match=${filteredAvailableJobs.length} | Next=${nextJob ? nextJob.id.slice(-4) : "None"} | Active=${activeRequest ? activeRequest.id.slice(-4) : "None"}`;
    setDebugLog(statusMsg);

    if (nextJob) {
      if (!activeRequest || activeRequest.id !== nextJob.id) {
        console.log("[ModalTrigger] Setting active request to:", nextJob.id);
        setActiveRequest(nextJob);
        setCountdown(25);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } else {
      if (activeRequest) {
        console.log("[ModalTrigger] Clearing active request");
        setActiveRequest(null);
      }
    }
  }, [filteredAvailableJobs, declinedRequests, activeRequest, availableBookings.length]);

  // Periodically clean up expired declines every 5 seconds to trigger re-evaluation
  useEffect(() => {
    const interval = setInterval(() => {
      setDeclinedRequests(prev => {
        const activeDeclines = prev.filter(d => Date.now() - d.declinedAt < 120000);
        if (activeDeclines.length !== prev.length) {
          console.log("[ModalTrigger] Cleaning up expired declines. Remaining:", activeDeclines);
          return activeDeclines;
        }
        return prev;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Handle ringing, vibration loop, and auto-decline countdown
  useEffect(() => {
    let timerInterval: any;
    
    if (activeRequest) {
      console.log("[ModalTrigger] Ringing vibration started for:", activeRequest.id);
      // Trigger continuous looping vibration pattern (1s vibrate, 1s pause)
      Vibration.vibrate([1000, 1000, 1000, 1000], true);

      // Countdown timer
      timerInterval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            console.log("[ModalTrigger] Countdown expired. Auto-declining:", activeRequest.id);
            // Auto decline with timestamp
            setDeclinedRequests(prevDeclined => [...prevDeclined, { id: activeRequest.id, declinedAt: Date.now() }]);
            setActiveRequest(null);
            Vibration.cancel();
            return 25;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      console.log("[ModalTrigger] Stopping vibration and clearing timer");
      Vibration.cancel();
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [activeRequest]);

  // Sync online state with profile
  useEffect(() => {
    if (profile?.isOnline !== undefined) {
      setIsOnline(profile.isOnline);
    }
  }, [profile?.isOnline]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchBookings();
    setDeclinedRequests([]); // Clear all declines on pull-to-refresh for instant testing
    // Safety timeout: stop spinning after 5 seconds
    setTimeout(() => {
      setRefreshing(false);
    }, 5000);
  }, [fetchBookings]);

  const handleUpdateStatus = async (bookingId: string, currentStatus: string) => {
    let nextStatus = '';
    let confirmMsg = '';

    switch (currentStatus) {
      case 'assigned':
      case 'accepted':
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
      setCurrentPhotoBooking(bookings.find(b => b.id === bookingId) || null);
      setShowPhotoModal(true);
      return;
    }

    if (currentStatus === 'started') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhotoType('after');
      setCurrentPhotoBooking(bookings.find(b => b.id === bookingId) || null);
      setShowPhotoModal(true);
      return;
    }


    Alert.alert(
      'Update Status',
      confirmMsg,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Confirm', 
          onPress: async () => {
            try {
              const booking = bookings.find(b => b.id === bookingId);
              await updateDoc(doc(db, 'bookings', bookingId), {
                status: nextStatus,
                [`${nextStatus}At`]: new Date().toISOString(),
                ...(nextStatus === 'accepted' ? {
                  workerId: profile?.uid,
                  workerName: profile?.firstName + ' ' + (profile?.lastName || ''),
                  workerPhone: profile?.phone || '',
                  workerImage: profile?.image || ''
                } : {})
              });
              
              // Notify customer
              if (booking?.userId) {
                let title = '';
                let body = '';
                if (nextStatus === 'on_the_way') { title = 'Partner on the way'; body = 'Your partner is heading to your location.'; }
                else if (nextStatus === 'arrived') { title = 'Partner arrived'; body = 'Your partner is waiting outside!'; }
                else if (nextStatus === 'started') { title = 'Service started'; body = 'Your service has started.'; }
                else if (nextStatus === 'completed') { title = 'Service completed'; body = 'Thank you for using DirtFree!'; }
                if (title) notifyCustomer(booking.userId, title, body);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to update status');
            }
          }
        }
      ]
    );
  };

  const handlePhotoUpload = async () => {
    if (!currentPhotoBooking) return;

    try {
      // Request permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Sorry, we need camera permissions to make this work!');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled) {
        setPhotoLoading(true);
        const imageUrl = await uploadToCloudinary(result.assets[0].uri, 'job_verifications');
        
        const nextStatus = photoType === 'before' ? 'started' : 'completed';
        const updateData: any = {
          status: nextStatus,
          [`${nextStatus}At`]: new Date().toISOString(),
          [`${photoType}Image`]: imageUrl
        };

        try {
          await updateDoc(doc(db, 'bookings', currentPhotoBooking.id), updateData);
        } catch (updateError) {
          console.error("Firestore update failed:", updateError);
          throw updateError;
        }
        
        // Notify customer
        if (currentPhotoBooking.userId) {
          let title = nextStatus === 'started' ? 'Service started' : 'Service completed';
          let body = nextStatus === 'started' ? 'Your service has started.' : 'Thank you for using DirtFree!';
          notifyCustomer(currentPhotoBooking.userId, title, body);
        }

        setShowPhotoModal(false);
        setPhotoLoading(false);
        setCurrentPhotoBooking(null);
        Alert.alert('Success', `Task ${nextStatus === 'started' ? 'started' : 'completed'} successfully!`);
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Error', error.message || 'Failed to upload photo');
      setPhotoLoading(false);
    }
  };

  // isOnline hoisted
  const [updatingOnline, setUpdatingOnline] = useState(false);

  useEffect(() => {
    let locationSubscription: any = null;

    const startLocationTracking = async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Location permission denied');
          return;
        }

        // Fetch initial GPS coordinates immediately on going online
        if (isOnline && profile?.uid) {
          try {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setPartnerCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            await updateDoc(doc(db, 'partners', profile.uid), {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              location: {
                lat: loc.coords.latitude,
                lng: loc.coords.longitude
              },
              lastLocationUpdate: new Date().toISOString()
            });
            console.log("[LocationService] Initial coordinates fetched and stored:", loc.coords.latitude, loc.coords.longitude);
          } catch (e) {
            console.warn("[LocationService] Error fetching initial coordinates:", e);
          }
        }

        // Keep watching for movements
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 15000, // Update every 15 seconds for testing/smoothness
            distanceInterval: 10,  // Or every 10 meters
          },
          async (loc) => {
            if (isOnline && profile?.uid) {
              setPartnerCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
              await updateDoc(doc(db, 'partners', profile.uid), {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                location: {
                  lat: loc.coords.latitude,
                  lng: loc.coords.longitude
                },
                lastLocationUpdate: new Date().toISOString()
              });
            }
          }
        );
      } catch (err) {
        console.error('Error starting location tracking:', err);
      }
    };

    if (isOnline) {
      startLocationTracking();
    }

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [isOnline, profile?.uid]);

  const toggleOnline = async () => {
    if (!profile?.uid) return;
    setUpdatingOnline(true);
    const newStatus = !isOnline;
    try {
      await updateDoc(doc(db, 'partners', profile.uid), {
        isOnline: newStatus,
        lastOnlineAt: new Date().toISOString()
      });
      setIsOnline(newStatus);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error updating online status:', error);
      Alert.alert('Error', 'Failed to update online status');
    } finally {
      setUpdatingOnline(false);
    }
  };

  const takePhoto = async () => {
    if (!currentPhotoBooking) return;

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });

      if (!result.canceled) {
        setPhotoLoading(true);
        const imageUrl = await uploadToCloudinary(result.assets[0].uri, 'job_verifications');
        
        const nextStatus = photoType === 'before' ? 'started' : 'completed';
        const updateData: any = {
          status: nextStatus,
          [`${nextStatus}At`]: new Date().toISOString(),
          [`${photoType}Image`]: imageUrl
        };

        await updateDoc(doc(db, 'bookings', currentPhotoBooking.id), updateData);
        
        setShowPhotoModal(false);
        setPhotoLoading(false);
        setCurrentPhotoBooking(null);
        Alert.alert('Success', `Task ${nextStatus === 'started' ? 'started' : 'completed'} successfully!`);
      }
    } catch (error: any) {
      setPhotoLoading(false);
      console.error('Photo error:', error);
      Alert.alert('Error', error.message || 'Failed to take photo');
    }
  };


  const handleAcceptBooking = async (bookingId: string) => {
    if (!profile?.uid) return;
    
    Vibration.cancel();
    socketService.emit('acceptBooking', {
      bookingId,
      partnerId: profile.uid,
      partnerName: profile.firstName
    });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'accepted',
        workerId: profile.uid,
        workerName: `${profile.firstName} ${profile.lastName || ''}`.trim(),
        workerPhone: profile.phoneNumber || '',
        acceptedAt: serverTimestamp()
      });
      
      // Notify customer
      const booking = availableBookings.find(b => b.id === bookingId) || activeRequest;
      if (booking?.userId) {
        notifyCustomer(booking.userId, 'Booking Accepted', `${profile.firstName} has accepted your booking!`);
      }

      if (activeRequest && activeRequest.id === bookingId) {
        setActiveRequest(null);
      }
    } catch (e) {
      console.error("Direct Firestore accept failed:", e);
      Alert.alert("Error", "Could not accept booking. It may have been accepted already.");
    }
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleMarkAsPaid = async (bookingId: string, amount: number) => {
    Alert.alert(
      'Confirm Payment',
      `Did you receive cash payment of ₹${amount}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Received', 
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'bookings', bookingId), {
                paymentStatus: 'paid',
                paymentCollectedAt: new Date().toISOString()
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setSelectedBooking(prev => prev ? { ...prev, paymentStatus: 'paid' } : null);
              Alert.alert('Success', 'Payment marked as paid.');
            } catch (error) {
              console.error('Error marking paid:', error);
              Alert.alert('Error', 'Failed to update payment status');
            }
          }
        }
      ]
    );
  };

  const handleNavigate = (address: string) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    Linking.openURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#111827';
      case 'started': return '#6366F1';
      case 'on_the_way': return '#f59e0b';
      case 'arrived': return '#8b5cf6';
      case 'cancelled': return '#ef4444';
      default: return '#64748b';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, ' ').toUpperCase();
  };

  const renderTaskItem = ({ item }: { item: Booking }) => {
    const isCompleted = item.status === 'completed';
    const isCancelled = item.status === 'cancelled';
    
    // Determine main action
    let actionText = 'Update Status';
    let actionIcon = 'arrow-forward';
    let actionBgColor = '#4F46E5';
    let actionDisabled = false;

    if (item.status === 'accepted') {
      actionText = 'Start Journey';
      actionBgColor = '#111827';
    } else if (item.status === 'on_the_way') {
      actionText = 'Mark Arrived';
      actionBgColor = '#f59e0b';
    } else if (item.status === 'arrived') {
      actionText = 'Start Job';
      actionBgColor = '#10b981';
      actionIcon = 'play';
    } else if (item.status === 'started') {
      actionText = 'Complete Job';
      actionBgColor = '#ef4444';
      actionIcon = 'checkmark-done';
    } else if (isCompleted || isCancelled) {
      actionDisabled = true;
      actionText = isCompleted ? 'Completed' : 'Cancelled';
      actionBgColor = '#e2e8f0';
    }

    return (
      <View style={styles.premiumTaskCard}>
        {/* Card Header: Badges & ID */}
        <View style={styles.premiumCardHeader}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            <View style={[styles.premiumBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
              <Text style={[styles.premiumBadgeText, { color: getStatusColor(item.status) }]}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
            {item.isUrgent && (
              <View style={[styles.premiumBadge, { backgroundColor: '#fef2f2' }]}>
                <Ionicons name="flash" size={10} color="#ef4444" />
                <Text style={[styles.premiumBadgeText, { color: '#ef4444' }]}>URGENT</Text>
              </View>
            )}
            {item.paymentStatus === 'paid' ? (
              <View style={[styles.premiumBadge, { backgroundColor: '#e6f4ea' }]}>
                <Ionicons name="cash" size={10} color="#137333" />
                <Text style={[styles.premiumBadgeText, { color: '#137333' }]}>PAID</Text>
              </View>
            ) : item.paymentMethod === 'Offline' && (
              <View style={[styles.premiumBadge, { backgroundColor: '#fffbeb' }]}>
                <Ionicons name="time" size={10} color="#b06000" />
                <Text style={[styles.premiumBadgeText, { color: '#b06000' }]}>COD PENDING</Text>
              </View>
            )}
          </View>
          <Text style={styles.premiumBookingId}>#{item.id.slice(-5).toUpperCase()}</Text>
        </View>

        {/* Service Details */}
        <Text style={styles.premiumServiceName} numberOfLines={2}>
          {item.service || item.serviceName || item.title || (item.items && item.items[0]?.serviceName) || 'Service Call'}
        </Text>
        <Text style={styles.premiumCustomerName}>{item.userName || 'Customer'}</Text>

        {/* Info Grid */}
        <View style={styles.premiumInfoGrid}>
          <View style={styles.premiumInfoItem}>
            <Ionicons name="calendar" size={16} color="#64748b" />
            <Text style={styles.premiumInfoText}>
              {item.date || (item.items && item.items[0]?.date) || item.scheduledDate || 'Today'}
            </Text>
          </View>
          <View style={styles.premiumInfoItem}>
            <Ionicons name="time" size={16} color="#64748b" />
            <Text style={styles.premiumInfoText}>
              {item.startTime || (item.items && item.items[0]?.startTime) || item.time || item.slot || '10:00 AM'}
            </Text>
          </View>
        </View>

        <View style={styles.premiumAddressBox}>
          <View style={styles.premiumAddressIcon}>
            <Ionicons name="location" size={18} color="#4F46E5" />
          </View>
          <Text style={styles.premiumAddressText} numberOfLines={2}>
            {item.userAddress || item.address || 'Address not available'}
          </Text>
        </View>

        {/* Actions */}
        {!isCompleted && !isCancelled && (
          <View style={styles.premiumActionRow}>
            <TouchableOpacity 
              style={styles.premiumIconBtn} 
              onPress={() => handleCall(item.userPhone)}
            >
              <Ionicons name="call" size={20} color="#111827" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.premiumIconBtn, { position: 'relative' }]} 
              onPress={() => {
                setChatBooking(item);
                setIsChatOpen(true);
              }}
            >
              <Ionicons name="chatbubble" size={20} color="#111827" />
              <ChatBadge bookingId={item.id} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.premiumIconBtn} 
              onPress={() => {
                const address = item.userAddress || item.address;
                const url = Platform.select({
                  ios: `maps:0,0?q=${address}`,
                  android: `geo:0,0?q=${address}`,
                }) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`;
                Linking.openURL(url);
              }}
            >
              <Ionicons name="navigate" size={20} color="#111827" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.premiumMainBtn, { backgroundColor: actionBgColor }]} 
              disabled={actionDisabled}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleUpdateStatus(item.id, item.status);
              }}
            >
              <Text style={styles.premiumMainBtnText}>{actionText}</Text>
              <Ionicons name={actionIcon as any} size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // Hoisted filteredAvailableJobs, getDistanceKm, getJobDistanceText

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>Fetching tasks...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Modern Compact Header */}
      <View style={styles.modernHeader}>
        <View style={styles.headerProfileArea}>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/profile')}>
            <Image source={{ uri: profile?.profileImage || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' }} style={{ width: '100%', height: '100%', borderRadius: 24 }} />
          </TouchableOpacity>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.name}>{profile?.firstName}</Text>
          </View>
        </View>

        {/* Sleek Online Toggle inside Header */}
        <TouchableOpacity 
          style={[styles.compactOnlineToggle, { backgroundColor: isOnline ? '#e6f4ea' : '#f1f5f9' }]}
          onPress={toggleOnline}
          disabled={updatingOnline}
        >
          {updatingOnline ? (
            <ActivityIndicator size="small" color={isOnline ? '#137333' : '#64748b'} />
          ) : (
            <>
              <View style={[styles.compactOnlineDot, { backgroundColor: isOnline ? '#10b981' : '#94a3b8' }]} />
              <Text style={[styles.compactOnlineText, { color: isOnline ? '#137333' : '#64748b' }]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={bookings.filter(b => {
          if (b.status === 'completed' || b.status === 'cancelled') return false;
          return true; // We already filtered out non-instant from standardBookings, or we just show whatever is assigned
        })}
        keyExtractor={(item) => item.id}
        renderItem={renderTaskItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#111827" />
        }
        ListHeaderComponent={
          <>
            {/* Minimal Dashboard Row */}
            <View style={styles.miniDashboard}>
              <View style={styles.miniStatCard}>
                <Ionicons name="checkmark-circle" size={24} color="#4F46E5" />
                <View>
                  <Text style={styles.miniStatValue}>{stats.totalTasks}</Text>
                  <Text style={styles.miniStatLabel}>Total Tasks</Text>
                </View>
              </View>
              <View style={styles.miniStatCard}>
                <Ionicons name="star" size={24} color="#f59e0b" />
                <View>
                  <Text style={styles.miniStatValue}>{stats.rating}</Text>
                  <Text style={styles.miniStatLabel}>Rating</Text>
                </View>
              </View>
            </View>

            {/* Schedule Banner */}
            {scheduleCount > 0 && (
              <TouchableOpacity 
                style={[styles.miniStatCard, { backgroundColor: '#4F46E5', marginBottom: 16, width: '100%' }]}
                onPress={() => router.push('/schedule')}
              >
                <Ionicons name="calendar" size={24} color="#fff" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>
                    {scheduleCount} Scheduled {scheduleCount === 1 ? 'Task' : 'Tasks'}
                  </Text>
                  <Text style={{ color: '#e0e7ff', fontSize: 13 }}>
                    You have some jobs for today. Tap to view.
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </TouchableOpacity>
            )}

            {/* Single Title instead of Tabs */}
            <View style={styles.tabSwitcher}>
              <View style={[styles.tabButton, styles.tabButtonActive, { width: '100%' }]}>
                <Text style={[styles.tabText, styles.tabTextActive]}>Active Instant Jobs</Text>
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Image 
              source={{ uri: activeTab === 'instant' 
                ? 'https://cdn-icons-png.flaticon.com/512/9484/9484089.png' 
                : 'https://cdn-icons-png.flaticon.com/512/2693/2693507.png' 
              }} 
              style={styles.emptyImage}
            />
            <Text style={styles.emptyText}>
              {activeTab === 'instant' ? 'No Live Tasks' : 'Schedule Clear'}
            </Text>
            <Text style={styles.emptySubText}>
              {activeTab === 'instant' 
                ? "You're online! We'll alert you when an instant job comes near you." 
                : "You have no scheduled bookings assigned to you yet."}
            </Text>
          </View>
        }
      />

      {/* Uber-style Fullscreen Incoming Booking Request Modal */}
      {!!activeRequest && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 99999, backgroundColor: 'rgba(14, 18, 32, 0.98)' }]}>
          <SafeAreaView style={styles.incomingContainer}>
            {/* Header / Indicator */}
            <View style={styles.incomingHeader}>
              <View style={styles.incomingBadge}>
                <Ionicons name="flash" size={12} color="#D6A75A" />
                <Text style={styles.incomingBadgeText}>INCOMING REQUEST</Text>
              </View>
              <Text style={styles.incomingTimer}>{countdown}s</Text>
            </View>

            {/* Radar Animation Area */}
            <View style={styles.radarContainer}>
              <View style={styles.radarRingOuter} />
              <View style={styles.radarRingMiddle} />
              <View style={styles.radarRingInner} />
              <View style={styles.radarCenter}>
                <Ionicons name="sparkles" size={32} color="#111827" />
              </View>
            </View>

            {/* Request Info Card */}
            <View style={styles.requestCard}>
              <Text style={styles.requestServiceTitle} numberOfLines={2}>
                {activeRequest?.title || activeRequest?.service || activeRequest?.serviceName || (activeRequest?.items && activeRequest?.items[0]?.serviceName) || 'Deep Cleaning'}
              </Text>
              
              {/* Price / Earnings Badge */}
              <View style={styles.earningsBadge}>
                <Text style={styles.earningsLabel}>YOUR ESTIMATED EARNINGS</Text>
                <Text style={styles.earningsValue}>₹{activeRequest?.price || activeRequest?.totalPrice || '399'}</Text>
              </View>

              {/* Distance / Location Info */}
              <View style={styles.infoRow}>
                <Ionicons name="location" size={18} color="#D6A75A" />
                <Text style={[styles.infoText, { fontSize: 16, fontWeight: '800', color: '#fff' }]}>
                  {getJobDistanceText()}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.6)', marginLeft: 30, marginTop: 4, marginBottom: 12 }} numberOfLines={2}>
                {activeRequest?.userAddress || 'Indore, Madhya Pradesh'}
              </Text>
              
              {/* Payment Method */}
              <View style={[styles.infoRow, { marginTop: 12 }]}>
                <Ionicons name="card" size={16} color="#64748b" />
                <Text style={styles.infoText}>
                  Payment: {activeRequest?.paymentMethod || 'UPI'} • {activeRequest?.paymentStatus || 'Pending'}
                </Text>
              </View>

              {/* Progress/Ticking countdown bar */}
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { width: `${(countdown / 25) * 100}%` }]} />
              </View>
            </View>

            {/* Control Buttons */}
            <View style={styles.incomingActions}>
              <TouchableOpacity 
                style={styles.incomingDeclineBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  if (activeRequest) {
                    setDeclinedRequests(d => [...d, { id: activeRequest.id, declinedAt: Date.now() }]);
                    setActiveRequest(null);
                  }
                }}
              >
                <Text style={styles.incomingDeclineText}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.incomingAcceptBtn}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  if (activeRequest) {
                    handleAcceptBooking(activeRequest.id);
                  }
                }}
              >
                <Text style={styles.incomingAcceptText}>Accept Job</Text>
                <Ionicons name="arrow-forward-outline" size={20} color="#111827" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      )}

      <Modal
        visible={!!selectedBooking}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedBooking(null)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setSelectedBooking(null)}
        >
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.modernModalContent}>
            <View style={styles.modalHandle} />
            
            {selectedBooking && (
              <View style={styles.modalHeader}>
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.serviceName}>
                    {selectedBooking.title || selectedBooking.service || selectedBooking.serviceName || (selectedBooking.items && selectedBooking.items[0]?.serviceName) || 'Service Call'}
                  </Text>
                  <Text style={styles.bookingIdSmall}>ID: #{selectedBooking.id.slice(-8).toUpperCase()}</Text>
                </View>
                <TouchableOpacity 
                  onPress={() => setSelectedBooking(null)}
                  style={styles.modernCloseButton}
                >
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
            )}

            {selectedBooking && (
              <ScrollView 
                showsVerticalScrollIndicator={false}
                style={styles.modalScroll}
              >
                <View style={styles.statusRow}>
                  <View style={[styles.modernStatusBadge, { backgroundColor: getStatusColor(selectedBooking.status) + '15' }]}>
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(selectedBooking.status) }]} />
                    <Text style={[styles.statusText, { color: getStatusColor(selectedBooking.status) }]}>
                      {getStatusLabel(selectedBooking.status)}
                    </Text>
                  </View>
                  <Text style={styles.timeAgoText}>Updated 2m ago</Text>
                </View>

                <View style={styles.modernDetailCard}>
                  <Text style={styles.cardLabel}>Service Overview</Text>
                  <View style={styles.serviceMainInfo}>
                    <View style={styles.serviceIconContainerLarge}>
                      <Ionicons name="sparkles" size={32} color="#111827" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.serviceNameLarge}>
                        {selectedBooking.service || selectedBooking.serviceName || (selectedBooking.items && selectedBooking.items[0]?.serviceName) || 'Standard Cleaning'}
                      </Text>
                      <Text style={styles.customerNameMain}>{selectedBooking.userName || 'Customer'}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.infoGrid}>
                  <View style={styles.infoGridItem}>
                    <Ionicons name="calendar-outline" size={20} color="#6366F1" />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.gridLabel}>Date</Text>
                      <Text style={styles.gridValue}>
                        {selectedBooking.date || (selectedBooking.items && selectedBooking.items[0]?.date) || 'Today'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.infoGridItem}>
                    <Ionicons name="time-outline" size={20} color="#6366F1" />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.gridLabel}>Arrival</Text>
                      <Text style={styles.gridValue}>
                        {selectedBooking.startTime || (selectedBooking.items && selectedBooking.items[0]?.startTime) || '10:00 AM'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.modernDetailCard}>
                  <Text style={styles.cardLabel}>Location & Contact</Text>
                  <View style={styles.customerRow}>
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarText}>
                        {(selectedBooking.userName || selectedBooking.name || 'C').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 16 }}>
                      <Text style={styles.customerNameMain}>
                        {selectedBooking.userName || selectedBooking.name || 'Customer'}
                      </Text>
                      <Text style={styles.customerPhoneMain}>{selectedBooking.userPhone || 'N/A'}</Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.callActionButton}
                      onPress={() => handleCall(selectedBooking.userPhone)}
                    >
                      <Ionicons name="call" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  
                  <TouchableOpacity 
                    style={styles.modernAddressBox}
                    onPress={() => handleNavigate(selectedBooking.userAddress || selectedBooking.address || '')}
                  >
                    <View style={styles.addressIconCircle}>
                      <Ionicons name="location" size={18} color="#6366F1" />
                    </View>
                    <Text style={styles.addressTextModern}>
                      {selectedBooking.userAddress || selectedBooking.address || 'No address provided'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {selectedBooking.items && selectedBooking.items.length > 0 && (
                  <View style={styles.itemsSection}>
                    <Text style={styles.cardLabel}>Work Checklist</Text>
                    {selectedBooking.items.map((item, index) => (
                      <View key={index} style={styles.modernItemRow}>
                        <Ionicons name="checkmark-circle" size={20} color="#6366F1" />
                        <Text style={styles.modernItemText}>
                          {item.serviceName || item.service || item.name || 'Service'} (Qty: {item.quantity || item.qty || 1})
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Payment Details Section */}
                <View style={styles.modernDetailCard}>
                  <Text style={styles.cardLabel}>Payment Details</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>
                        ₹{selectedBooking.totalPrice || selectedBooking.price || selectedBooking.totalAmount || 0}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: '600' }}>
                        Method: {selectedBooking.paymentMethod === 'Offline' ? 'Cash / Pay Later' : (selectedBooking.paymentMethod || 'Online')}
                      </Text>
                    </View>
                    
                    {selectedBooking.paymentStatus === 'paid' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#e6f4ea', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: '#ceead6' }}>
                        <Ionicons name="checkmark-circle" size={16} color="#137333" />
                        <Text style={{ fontSize: 12, fontWeight: '900', color: '#137333' }}>PAID</Text>
                      </View>
                    ) : (
                      selectedBooking.paymentMethod === 'Offline' ? (
                        <TouchableOpacity 
                          style={{ backgroundColor: '#111827', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 16 }}
                          onPress={() => handleMarkAsPaid(selectedBooking.id, parseFloat(String(selectedBooking.totalPrice || selectedBooking.price || selectedBooking.totalAmount || 0)))}
                        >
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>Mark as Paid</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef7e0', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: '#feebc8' }}>
                          <Ionicons name="time" size={16} color="#b06000" />
                          <Text style={{ fontSize: 12, fontWeight: '900', color: '#b06000' }}>PENDING</Text>
                        </View>
                      )
                    )}
                  </View>
                </View>
                
                <View style={{ height: 120 }} />
              </ScrollView>
            )}

            {selectedBooking && selectedBooking.status !== 'completed' && selectedBooking.status !== 'cancelled' && (
              <View style={styles.modalFooter}>
                <TouchableOpacity 
                  style={styles.modernPrimaryAction}
                  onPress={() => {
                    handleUpdateStatus(selectedBooking.id, selectedBooking.status);
                    setSelectedBooking(null);
                  }}
                >
                  <Text style={styles.modernPrimaryActionText}>
                    {selectedBooking.status === 'accepted' || selectedBooking.status === 'assigned' ? 'Start Journey' : 
                     selectedBooking.status === 'on_the_way' ? 'I Have Arrived' :
                     selectedBooking.status === 'arrived' ? 'Begin Work' :
                     selectedBooking.status === 'started' ? 'Finish Job' : 'Update Task'}
                  </Text>
                  <Ionicons name="arrow-forward" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Modern Photo Verification Modal */}
      <Modal
        visible={showPhotoModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => !photoLoading && setShowPhotoModal(false)}
      >
        <View style={styles.photoModalOverlay}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.modernPhotoModalContent}>
            <View style={styles.modalHandle} />
            <View style={styles.photoModalHeader}>
              <View>
                <Text style={styles.photoModalTitle}>
                  {photoType === 'before' ? 'Step 1: Before Photo' : 'Step 2: After Photo'}
                </Text>
                <Text style={styles.photoModalSubtitle}>
                  Please capture the {photoType === 'before' ? 'work area' : 'completed work'}
                </Text>
              </View>
              {!photoLoading && (
                <TouchableOpacity onPress={() => setShowPhotoModal(false)} style={styles.modernCloseButton}>
                  <Ionicons name="close" size={20} color="#64748b" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.photoContainer}>
              <View style={styles.cameraPlaceholder}>
                <Ionicons name="camera-outline" size={48} color="#e2e8f0" />
              </View>
              
              {photoLoading ? (
                <View style={styles.modernUploadingContainer}>
                  <ActivityIndicator size="small" color="#111827" />
                  <Text style={styles.modernUploadingText}>Processing & Uploading...</Text>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.modernTakePhotoBtn} 
                  onPress={takePhoto}
                >
                  <View style={styles.cameraBtnIcon}>
                    <Ionicons name="camera" size={24} color="#fff" />
                  </View>
                  <Text style={styles.modernTakePhotoText}>Capture Image</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.guidelinesBox}>
              <Ionicons name="information-circle" size={18} color="#64748b" />
              <Text style={styles.guidelineText}>
                Make sure the photo is clear and well-lit for faster approval.
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Uber-Style Incoming Job Modal */}
      <Modal visible={!!incomingJob} animationType="slide" transparent={false}>
        <View style={{ flex: 1, backgroundColor: '#0f172a', padding: 24, justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(99, 102, 241, 0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <Ionicons name="car" size={40} color="#818cf8" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 12 }}>
              {incomingJob?.isUrgent ? "🚨 URGENT RIDE" : "NEW JOB REQUEST"}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#cbd5e1', textAlign: 'center' }}>
              {incomingJob?.serviceName || 'Service'}
            </Text>
          </View>

          <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 24, padding: 24, marginBottom: 40 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ color: '#94a3b8', fontSize: 14, fontWeight: '700' }}>Distance</Text>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{incomingJob?.distanceStr}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#94a3b8', fontSize: 14, fontWeight: '700' }}>Est. Time</Text>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>{incomingJob?.etaStr}</Text>
            </View>
          </View>

          <View style={{ alignItems: 'center', marginBottom: 40 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#fff' }}>{incomingCountdown}</Text>
            </View>
            <Text style={{ color: '#64748b', marginTop: 8, fontSize: 12, fontWeight: '800' }}>SECONDS REMAINING</Text>
          </View>

          <View style={styles.incomingActions}>
            <TouchableOpacity style={styles.incomingDeclineBtn} onPress={handleRejectIncoming}>
              <Text style={styles.incomingDeclineText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.incomingAcceptBtn} onPress={handleAcceptIncoming}>
              <Text style={styles.incomingAcceptText}>ACCEPT JOB</Text>
              <Ionicons name="arrow-forward" size={20} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ChatModal 
        visible={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
        booking={chatBooking} 
        profile={profile}
      />
    </View>
  );
}

function ChatBadge({ bookingId }: { bookingId: string }) {
  const [count, setCount] = useState(0);
  const { profile } = useAuth();

  useEffect(() => {
    if (!bookingId || !profile?.uid) return;

    const q = query(
      collection(db, 'bookings', bookingId, 'messages')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const unread = snapshot.docs.filter(d => {
        const data = d.data();
        return data.senderId !== profile.uid && data.read === false;
      }).length;
      setCount(unread);
    });

    return unsub;
  }, [bookingId, profile?.uid]);

  if (count === 0) return null;

  return (
    <View style={styles.unreadBadge}>
      <Text style={styles.unreadBadgeText}>{count}</Text>
    </View>
  );
}

function ChatModal({ visible, onClose, booking }: any) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const { profile } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!visible || !booking?.id || !profile?.uid) return;

    const q = query(
      collection(db, 'bookings', booking.id, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        time: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
      }));
      setMessages(msgs);

      // Mark other user's messages as read by partner
      snapshot.docs.forEach(async (d) => {
        const data = d.data();
        if (data.senderId !== profile.uid && data.read === false) {
          try {
            await updateDoc(doc(db, 'bookings', booking.id, 'messages', d.id), {
              read: true
            });
          } catch (err) {
            console.error("Error marking message read by partner:", err);
          }
        }
      });
    });

    return unsubscribe;
  }, [visible, booking?.id, profile?.uid]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    try {
      const text = input.trim();
      setInput('');
      await addDoc(collection(db, 'bookings', booking.id, 'messages'), {
        text,
        senderId: profile?.uid,
        senderName: profile?.firstName || 'Partner',
        read: false,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error(e);
    }
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isMe = item.senderId === profile?.uid;
    return (
      <View style={[styles.messageWrapper, isMe ? styles.myMessageWrapper : styles.theirMessageWrapper]}>
        <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}>
          <Text style={[isMe ? styles.myMessageText : styles.theirMessageText]}>
            {item.text}
          </Text>
          <Text style={[styles.messageTime, isMe ? styles.myMessageTime : styles.theirMessageTime]}>
            {item.time}
          </Text>
        </View>
        <Text style={styles.senderNameLabel}>{isMe ? 'You' : item.senderName}</Text>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={onClose} style={styles.chatBackButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <View>
            <Text style={styles.chatTitle}>Chat with {booking?.userName || 'Customer'}</Text>
            <Text style={styles.chatSubtitle}>Booking ID: #{booking?.id.slice(-6).toUpperCase()}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 30 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          <View style={styles.chatInputContainer}>
            <TextInput 
              style={styles.chatInput}
              placeholder="Type your message..."
              value={input}
              onChangeText={setInput}
              multiline
              placeholderTextColor="#94a3b8"
            />
            <TouchableOpacity 
              onPress={sendMessage}
              style={styles.chatSendBtn}
              disabled={!input.trim()}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  
  // Styles update
  modernHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 60 : 50,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  headerProfileArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  greeting: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  name: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactOnlineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  compactOnlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compactOnlineText: {
    fontSize: 12,
    fontWeight: '800',
  },

  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },

  miniDashboard: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 24,
  },
  miniStatCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  miniStatValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
  },
  miniStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },

  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#111827',
    fontWeight: '900',
  },

  // Premium Task Card
  premiumTaskCard: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 16,
    elevation: 2,
  },
  premiumCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  premiumBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  premiumBookingId: {
    fontSize: 12,
    fontWeight: '800',
    color: '#cbd5e1',
  },
  premiumServiceName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5,
  },
  premiumCustomerName: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 16,
  },
  premiumInfoGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  premiumInfoItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 16,
    gap: 8,
  },
  premiumInfoText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  premiumAddressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 16,
    gap: 12,
    marginBottom: 20,
  },
  premiumAddressIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumAddressText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    lineHeight: 18,
  },
  premiumActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  premiumIconBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumMainBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  premiumMainBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  // Modal Luxe
  modernModalContent: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#e2e8f0',
    borderRadius: 2.5,
    alignSelf: 'center',
    marginTop: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },
  modalScroll: {
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  modernDetailCard: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 20,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
  },
  callActionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Chat Luxe
  chatHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 24, 
    paddingVertical: 20, 
    borderBottomWidth: 1, 
    borderBottomColor: '#f8fafc',
    backgroundColor: '#fff'
  },
  chatTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  chatSubtitle: { fontSize: 11, fontWeight: '700', color: '#94a3b8', marginTop: 2 },
  
  messageWrapper: { marginBottom: 24, maxWidth: '82%' },
  messageBubble: { padding: 18, borderRadius: 28 },
  myBubble: { backgroundColor: '#111827', borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: '#f1f5f9', borderBottomLeftRadius: 4 },
  myMessageText: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 22 },
  theirMessageText: { color: '#111827', fontSize: 14, fontWeight: '600', lineHeight: 22 },
  
  chatInputContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 24, 
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    borderTopWidth: 1, 
    borderTopColor: '#f8fafc',
    backgroundColor: '#fff',
    gap: 12
  },
  chatInput: { 
    flex: 1, 
    backgroundColor: '#f8fafc', 
    borderRadius: 28, 
    paddingHorizontal: 24, 
    paddingVertical: 14, 
    fontSize: 15, 
    color: '#111827',
    fontWeight: '600'
  },
  chatSendBtn: { 
    width: 56, 
    height: 56, 
    borderRadius: 28, 
    backgroundColor: '#6366F1', 
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 40,
  },
  emptyIconCircle: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: '#fff', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 15, 
    borderWidth: 1, 
    borderColor: '#f1f5f9' 
  },
  emptyImage: { width: 140, height: 140, marginBottom: 24, opacity: 0.8 },
  emptyText: { fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 8, letterSpacing: -0.5 },
  emptySubText: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22, fontWeight: '600' },

  // Generic helpers
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  timeAgoText: { fontSize: 11, color: '#94a3b8', fontWeight: '700' },
  gridLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase' },
  gridValue: { fontSize: 14, fontWeight: '900', color: '#111827', marginTop: 4 },
  customerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  customerNameMain: { fontSize: 18, fontWeight: '900', color: '#111827' },
  customerPhoneMain: { fontSize: 13, color: '#64748b', fontWeight: '700', marginTop: 2 },
  modernAddressBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f8fafc', padding: 18, borderRadius: 24 },
  addressIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  addressTextModern: { fontSize: 14, color: '#111827', fontWeight: '700', flex: 1 },
  itemsSection: { marginBottom: 20 },
  modernItemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, backgroundColor: '#f8fafc', padding: 16, borderRadius: 20 },
  modernItemText: { fontSize: 14, fontWeight: '800', color: '#475569' },
  modalFooter: { padding: 32, borderTopWidth: 1, borderTopColor: '#f8fafc', backgroundColor: '#fff' },
  modernPrimaryAction: { height: 64, backgroundColor: '#111827', borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  modernPrimaryActionText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  photoModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modernPhotoModalContent: { backgroundColor: '#fff', borderTopLeftRadius: 44, borderTopRightRadius: 44, paddingBottom: 44 },
  photoModalHeader: { padding: 32, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  photoModalTitle: { fontSize: 28, fontWeight: '900', color: '#111827', letterSpacing: -0.5 },
  photoModalSubtitle: { fontSize: 15, color: '#64748b', fontWeight: '600', marginTop: 4 },
  photoContainer: { padding: 32 },
  cameraPlaceholder: { height: 260, backgroundColor: '#f8fafc', borderRadius: 40, borderStyle: 'dashed', borderWidth: 2, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  modernUploadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  modernUploadingText: { fontSize: 15, fontWeight: '800', color: '#111827' },
  modernTakePhotoBtn: { height: 68, backgroundColor: '#111827', borderRadius: 24, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, gap: 16 },
  cameraBtnIcon: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  modernTakePhotoText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  guidelinesBox: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 32, backgroundColor: '#f8fafc', padding: 20, borderRadius: 24, marginHorizontal: 32, marginTop: 24 },
  guidelineText: { flex: 1, marginLeft: 10, fontSize: 12, color: '#64748b', lineHeight: 20, fontWeight: '600' },
  bookingIdSmall: { fontSize: 12, color: '#cbd5e1', fontWeight: '800', marginTop: 4 },
  modernCloseButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  modernStatusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, gap: 8 },
  serviceMainInfo: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  serviceIconContainerLarge: { width: 64, height: 64, borderRadius: 24, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  serviceNameLarge: { fontSize: 22, fontWeight: '900', color: '#111827', letterSpacing: -0.3 },
  senderNameLabel: { fontSize: 10, fontWeight: '800', color: '#cbd5e1', marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 },
  messageTime: { fontSize: 10, marginTop: 8 },
  myMessageTime: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  theirMessageTime: { color: '#94a3b8' },
  chatBackButton: { padding: 8, marginRight: 12 },
  myMessageWrapper: { alignSelf: 'flex-end' },
  theirMessageWrapper: { alignSelf: 'flex-start' },
  // Available Jobs Section
  nearbyBadge: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  nearbyBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  availableJobCard: {
    width: 200,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  availableJobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceIconSmall: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 2,
  },
  urgentMiniText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '900',
  },
  availableJobName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
  },
  availableJobCustomer: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  availableJobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  availableJobInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 8,
  },
  availableJobDist: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '700',
  },
  claimButton: {
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  // Uber-style Incoming Booking Modal Styles
  incomingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14, 18, 32, 0.96)',
  },
  incomingContainer: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
  },
  incomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  incomingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(214, 167, 90, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(214, 167, 90, 0.3)',
  },
  incomingBadgeText: {
    color: '#D6A75A',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  incomingTimer: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    backgroundColor: 'rgba(255,255,255,0.1)',
    height: 50,
    width: 50,
    borderRadius: 25,
    textAlign: 'center',
    lineHeight: 50,
  },
  radarContainer: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 20,
  },
  radarRingOuter: {
    position: 'absolute',
    height: 160,
    width: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  radarRingMiddle: {
    position: 'absolute',
    height: 120,
    width: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  radarRingInner: {
    position: 'absolute',
    height: 80,
    width: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  radarCenter: {
    height: 60,
    width: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  requestCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 8,
  },
  requestServiceTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 20,
  },
  earningsBadge: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  earningsLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  earningsValue: {
    color: '#22C58A',
    fontSize: 32,
    fontWeight: '900',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    marginTop: 24,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#D6A75A',
    borderRadius: 3,
  },
  incomingActions: {
    flexDirection: 'row',
    gap: 16,
    marginVertical: 20,
  },
  incomingDeclineBtn: {
    flex: 1,
    height: 60,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingDeclineText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  incomingAcceptBtn: {
    flex: 2,
    height: 60,
    backgroundColor: '#fff',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  incomingAcceptText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
  },
  unreadBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
});
