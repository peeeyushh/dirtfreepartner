import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';

export default function TabLayout() {
  const { profile } = useAuth();
  const [undoneCount, setUndoneCount] = useState(0);

  useEffect(() => {
    if (!profile?.uid) return;

    const tasksQuery = query(
      collection(db, 'serviceTasks'),
      where('assignedPartnerId', '==', profile.uid)
    );

    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
      const checkTasks = async () => {
        let count = 0;
        const todayStr = new Date().toDateString();
        
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          if (data.date) {
            const taskDateStr = new Date(data.date).toDateString();
            if (taskDateStr === todayStr && data.status !== 'completed' && data.status !== 'cancelled') {
              if (data.bookingId) {
                const bDoc = await getDoc(doc(db, 'bookings', data.bookingId));
                if (bDoc.exists()) {
                  count++;
                }
              } else {
                // If it doesn't have a bookingId, it's valid standalone
                count++;
              }
            }
          }
        }
        setUndoneCount(count);
      };
      
      checkTasks();
    });

    return () => unsubscribe();
  }, [profile?.uid]);

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#4F46E5', // Premium indigo color
      tabBarInactiveTintColor: '#94a3b8',
      tabBarStyle: {
        borderTopWidth: 1,
        borderTopColor: '#f8fafc',
        height: 65,
        paddingBottom: Platform.OS === 'ios' ? 20 : 12,
        paddingTop: 12,
        backgroundColor: '#fff',
        elevation: 0,
        shadowOpacity: 0,
      },
      tabBarLabelStyle: {
        fontSize: 11,
        fontWeight: '700',
        marginTop: 4,
      }
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flash" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
          tabBarBadge: undoneCount > 0 ? undoneCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444' }
        }}
      />
    </Tabs>
  );
}
