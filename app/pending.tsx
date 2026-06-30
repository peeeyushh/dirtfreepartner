import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

export default function PendingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile, signOut } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const primaryColor = '#111827';

  React.useEffect(() => {
    if (profile?.status === 'approved' || profile?.status === 'pending') {
      router.replace('/(tabs)');
    } else if (profile?.status === 'none' || profile?.status === 'rejected') {
      router.replace('/register');
    }
  }, [profile?.status]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshProfile();
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <View style={styles.pulseContainer}>
            <Ionicons name="time-outline" size={80} color={primaryColor} />
          </View>
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>Application Pending</Text>
          <Text style={styles.subtitle}>
            Thanks for your interest! Our team is currently reviewing your profile. 
            This usually takes 24-48 hours.
          </Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status:</Text>
            <View style={[styles.statusBadge, { backgroundColor: '#fef3c7' }]}>
              <Text style={[styles.statusText, { color: '#d97706' }]}>Under Review</Text>
            </View>
          </View>
          <Text style={styles.infoText}>We&apos;ll notify you once your account is approved.</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: primaryColor }]} 
          onPress={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Refresh Status</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.logoutButton} 
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 40,
  },
  pulseContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  statusCard: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
  },
  infoText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  footer: {
    paddingBottom: 20,
  },
  button: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  logoutButton: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
  },
});
