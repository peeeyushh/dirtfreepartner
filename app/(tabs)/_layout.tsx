import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform } from 'react-native';

export default function TabLayout() {
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
          href: null, // Hide this tab from the nav bar, since schedule is in Tasks
        }}
      />
    </Tabs>
  );
}
