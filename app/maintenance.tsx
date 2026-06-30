import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

export default function PartnerMaintenanceScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Feather name="settings" size={60} color="#00b167" />
        </View>
        
        <Text style={styles.title}>Partner Portal Maintenance</Text>
        <Text style={styles.description}>
          We are currently updating our partner systems to provide you with better tools and features. 
          Please check back in a few minutes.
        </Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoText}>Earnings and Jobs are being processed</Text>
        </View>
        
        <Text style={styles.footer}>DirtFree Partner Support</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#00b16710',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#00b16720',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 15,
    color: '#ffffff80',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  infoCard: {
    backgroundColor: '#ffffff05',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffffff10',
  },
  infoText: {
    color: '#ffffff60',
    fontSize: 13,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    fontSize: 12,
    color: '#00b16780',
    fontWeight: '700',
    textTransform: 'uppercase',
  }
});
