import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image as RNImage,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { getAuth, deleteUser } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Switch, Linking } from 'react-native';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, updateProfile, signOut } = useAuth();

  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    city: '',
    dob: '',
    profileImage: '',
  });

  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const vib = await AsyncStorage.getItem('notification_vibration');
        if (vib !== null) setVibrationEnabled(vib === 'true');
      } catch (error) {
        console.error('Error loading settings', error);
      }
    };
    loadSettings();
  }, []);

  const toggleVibration = async (value: boolean) => {
    setVibrationEnabled(value);
    await AsyncStorage.setItem('notification_vibration', value.toString());
  };

  const openSystemSettings = () => {
    Linking.openSettings();
  };



  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you absolutely sure you want to delete your account? This action cannot be undone and you will lose all your data.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete Permanently', 
          style: 'destructive',
          onPress: confirmDeleteAccount
        }
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (user && profile?.uid) {
        await deleteDoc(doc(db, 'users', profile.uid));
        await deleteUser(user);
        await signOut();
      }
    } catch (error: any) {
      console.error('Error deleting account:', error);
      if (error.code === 'auth/requires-recent-login') {
        Alert.alert('Authentication Required', 'Please sign out and sign back in before deleting your account.');
      } else {
        Alert.alert('Error', 'Failed to delete account. Please contact support.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const snap = await getDocs(collection(db, 'services'));
        setAvailableServices(snap.docs.map(doc => doc.data()));
      } catch (e) {
        console.error(e);
      }
    };
    fetchServices();
  }, []);

  useEffect(() => {
    if (profile) {
      setFormData({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        email: profile.email || '',
        city: profile.city || '',
        dob: profile.dob || '',
        profileImage: profile.profileImage || '',
      });
      setSelectedServices(profile.selectedServices || []);
    }
  }, [profile]);

  const uploadToCloudinary = async (uri: string) => {
    setUploadingImage(true);
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
      data.append('folder', 'workers');

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: 'POST',
          body: data,
        }
      );
      const result = await response.json();
      return result.secure_url;
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      Alert.alert('Upload Failed', 'Could not upload image.');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const pickImage = async () => {
    if (!isEditing) return;
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      const url = await uploadToCloudinary(result.assets[0].uri);
      if (url) {
        setFormData({ ...formData, profileImage: url });
      }
    }
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await updateProfile({
        profileImage: formData.profileImage, // only image is updatable here
        selectedServices,
      });
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      console.error('Update error:', error);
      Alert.alert('Error', 'Failed to update profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() }
    ]);
  };

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 50) }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Profile</Text>
        </View>
        <TouchableOpacity 
          style={styles.editBtn} 
          onPress={() => isEditing ? handleSave() : setIsEditing(true)}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#4F46E5" />
          ) : (
            <Text style={styles.editBtnText}>{isEditing ? 'Save' : 'Edit'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          <TouchableOpacity 
            style={styles.imageContainer} 
            onPress={pickImage}
            disabled={!isEditing || uploadingImage}
          >
            {formData.profileImage ? (
              <RNImage source={{ uri: formData.profileImage }} style={styles.profileImage} />
            ) : (
              <View style={styles.profileImagePlaceholder}>
                <Ionicons name="person" size={40} color="#94a3b8" />
              </View>
            )}
            
            {isEditing && (
              <View style={styles.editImageBadge}>
                {uploadingImage ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={16} color="#fff" />
                )}
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.phoneText}>{profile.phone}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{profile.status?.toUpperCase() || 'ACTIVE'}</Text>
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Personal Details</Text>
          
          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={formData.firstName}
                editable={false}
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={formData.lastName}
                editable={false}
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={[styles.input, !isEditing && styles.inputDisabled]}
              value={formData.email}
              onChangeText={(text) => setFormData({...formData, email: text})}
              editable={isEditing}
              keyboardType="email-address"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>City</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={formData.city}
              editable={false} // City might require admin approval to change
              placeholderTextColor="#94a3b8"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date of Birth</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={formData.dob}
              editable={false}
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Service Categories</Text>
          <View style={styles.servicesGrid}>
            {(isEditing ? availableServices.map(s => s.name) : selectedServices).map((service: string, index: number) => {
              const isSelected = selectedServices.includes(service);
              return (
                <TouchableOpacity 
                  key={index} 
                  style={[
                    styles.serviceChip, 
                    isSelected && styles.serviceChipSelected,
                    !isEditing && !isSelected && { display: 'none' } // hide unselected when not editing
                  ]}
                  disabled={!isEditing}
                  onPress={() => {
                    if (isSelected) {
                      setSelectedServices(selectedServices.filter(s => s !== service));
                    } else {
                      setSelectedServices([...selectedServices, service]);
                    }
                  }}
                >
                  <Ionicons name={isSelected ? "checkmark-circle" : "ellipse-outline"} size={16} color={isSelected ? "#4F46E5" : "#94a3b8"} />
                  <Text style={[styles.serviceChipText, isSelected && styles.serviceChipTextSelected]}>{service}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>App Settings</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.iconBox}>
                <Ionicons name="phone-portrait-outline" size={20} color="#4F46E5" />
              </View>
              <View>
                <Text style={styles.settingName}>Vibration</Text>
                <Text style={styles.settingDesc}>Vibrate on incoming tasks</Text>
              </View>
            </View>
            <Switch
              value={vibrationEnabled}
              onValueChange={toggleVibration}
              trackColor={{ false: '#e2e8f0', true: '#4F46E5' }}
              thumbColor={'#fff'}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.iconBox}>
                <Ionicons name="notifications-outline" size={20} color="#4F46E5" />
              </View>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={styles.settingName}>System Ringtone</Text>
                <Text style={styles.settingDesc} numberOfLines={2}>
                  Manage sound from device notification settings
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.actionBtn} onPress={openSystemSettings}>
              <Text style={styles.actionBtnText}>Open</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.settingRow, { borderColor: '#fef2f2', backgroundColor: '#fff', marginTop: 12 }]} onPress={handleDeleteAccount} disabled={isDeleting}>
            <View style={styles.settingInfo}>
              <View style={[styles.iconBox, { backgroundColor: '#fef2f2' }]}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </View>
              <View>
                <Text style={[styles.settingName, { color: '#ef4444' }]}>Delete Account</Text>
                <Text style={styles.settingDesc}>Permanently delete your data</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.logoutBtnText}>Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },
  editBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
  },
  editBtnText: {
    color: '#4F46E5',
    fontWeight: '800',
    fontSize: 14,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  imageContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#fff',
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  editImageBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4F46E5',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  phoneText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  statusBadge: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    color: '#4F46E5',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  formSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  inputDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#f1f5f9',
    color: '#94a3b8',
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  serviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  serviceChipSelected: {
    backgroundColor: '#eef2ff',
    borderColor: '#c7d2fe',
  },
  serviceChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
  },
  serviceChipTextSelected: {
    color: '#4F46E5',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fef2f2',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    marginTop: 16,
  },
  logoutBtnText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '800',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  settingName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  settingDesc: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  actionBtn: {
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  clearBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
