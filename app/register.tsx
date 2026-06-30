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
  Modal,
  FlatList,
  Alert,
  Image as RNImage,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { updateProfile } = useAuth();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    city: '',
    dob: '', // DD/MM/YYYY
    selectedServices: [] as string[],
    profileImage: '',
    aadharImage: '',
  });

  const [cities, setCities] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  
  const [showCityModal, setShowCityModal] = useState(false);

  const primaryColor = '#111827';

  const uploadToCloudinary = async (uri: string, folder: string) => {
    setUploadingImage(folder);
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
      Alert.alert('Upload Failed', 'Could not upload image. Please try again.');
      return null;
    } finally {
      setUploadingImage(null);
    }
  };

  const pickImage = async (type: 'profile' | 'aadhar') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: type === 'profile' ? [1, 1] : [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      const folder = type === 'profile' ? 'workers' : 'aadhar';
      const url = await uploadToCloudinary(result.assets[0].uri, folder);
      if (url) {
        setFormData({ 
          ...formData, 
          [type === 'profile' ? 'profileImage' : 'aadharImage']: url 
        });
      }
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Cities
        const citySnap = await getDocs(query(collection(db, 'cities'), where('isActive', '==', true)));
        const fetchedCities = citySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Fetch Services
        const serviceSnap = await getDocs(collection(db, 'services'));
        const fetchedServices = serviceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        setCities(fetchedCities);
        setServices(fetchedServices);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, []);

  const calculateAge = (dobString: string) => {
    const [day, month, year] = dobString.split('/').map(Number);
    if (!day || !month || !year) return 0;
    const today = new Date();
    const birthDate = new Date(year, month - 1, day);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleRegister = async () => {
    const { firstName, lastName, email, city, dob, selectedServices, profileImage, aadharImage } = formData;
    
    if (!firstName || !lastName || !email || !city || !dob || selectedServices.length === 0) {
      Alert.alert('Incomplete Form', 'Please fill in all required fields and select at least one service.');
      return;
    }

    if (!profileImage) {
      Alert.alert('Photo Required', 'Please upload your profile photo.');
      return;
    }

    if (!aadharImage) {
      Alert.alert('Aadhar Required', 'Please upload your Aadhar card photo.');
      return;
    }

    const age = calculateAge(dob);
    if (age < 18) {
      Alert.alert('Age Restriction', 'You must be at least 18 years old to register as a partner.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateProfile({
        ...formData,
        status: 'pending',
        createdAt: Date.now(),
      });
      router.replace('/pending');
    } catch (error) {
      console.error('Registration error:', error);
      Alert.alert('Error', 'Failed to register. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleService = (serviceName: string) => {
    const current = [...formData.selectedServices];
    const index = current.indexOf(serviceName);
    if (index > -1) {
      current.splice(index, 1);
    } else {
      current.push(serviceName);
    }
    setFormData({ ...formData, selectedServices: current });
  };

  if (loadingData) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={{ marginTop: 10, color: '#64748b' }}>Loading partner details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Partner Registration</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View>
            <View style={styles.profileImageSection}>
              <TouchableOpacity 
                style={styles.profileImageContainer} 
                onPress={() => pickImage('profile')}
                disabled={uploadingImage === 'workers'}
              >
                {formData.profileImage ? (
                  <RNImage source={{ uri: formData.profileImage }} style={styles.profileImage} />
                ) : (
                  <View style={styles.profilePlaceholder}>
                    {uploadingImage === 'workers' ? (
                      <ActivityIndicator color={primaryColor} />
                    ) : (
                      <>
                        <Ionicons name="camera" size={32} color="#94a3b8" />
                        <Text style={styles.photoLabel}>Photo</Text>
                      </>
                    )}
                  </View>
                )}
                <View style={styles.editBadge}>
                  <Ionicons name="pencil" size={14} color="#ffffff" />
                </View>
              </TouchableOpacity>
              <View style={styles.profileInfo}>
                <Text style={styles.profileTitle}>Profile Photo *</Text>
                <Text style={styles.profileSubtitle}>Upload a clear face photo</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Basic Information</Text>
            
            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>First Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="John"
                  value={formData.firstName}
                  onChangeText={(text) => {
                    // Allow only letters and spaces
                    const filtered = text.replace(/[^a-zA-Z\s]/g, '');
                    setFormData({ ...formData, firstName: filtered });
                  }}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Last Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Doe"
                  value={formData.lastName}
                  onChangeText={(text) => {
                    // Allow only letters and spaces
                    const filtered = text.replace(/[^a-zA-Z\s]/g, '');
                    setFormData({ ...formData, lastName: filtered });
                  }}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Date of Birth * (DD/MM/YYYY)</Text>
              <TextInput
                style={styles.input}
                placeholder="25/08/1995"
                keyboardType="numbers-and-punctuation"
                value={formData.dob}
                onChangeText={(text) => {
                  // Basic auto-slash formatting
                  let formatted = text.replace(/[^0-9]/g, '');
                  if (formatted.length > 2) formatted = formatted.slice(0, 2) + '/' + formatted.slice(2);
                  if (formatted.length > 5) formatted = formatted.slice(0, 5) + '/' + formatted.slice(5, 9);
                  setFormData({ ...formData, dob: formatted });
                }}
                maxLength={10}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="john.doe@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>City *</Text>
              <TouchableOpacity 
                style={styles.selector} 
                onPress={() => setShowCityModal(true)}
              >
                <Text style={[styles.selectorText, !formData.city && { color: '#94a3b8' }]}>
                  {formData.city || 'Select your city'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Services You Offer *</Text>
            <View style={styles.servicesGrid}>
              {services.map((service) => {
                const isSelected = formData.selectedServices.includes(service.name);
                return (
                  <TouchableOpacity
                    key={service.id}
                    style={[
                      styles.serviceChip,
                      isSelected && { backgroundColor: primaryColor, borderColor: primaryColor }
                    ]}
                    onPress={() => toggleService(service.name)}
                  >
                    <Text style={[styles.serviceChipText, isSelected && { color: '#ffffff' }]}>
                      {service.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Documents *</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Aadhar Card (Front/Both) *</Text>
              <TouchableOpacity 
                style={[styles.aadharUpload, formData.aadharImage && { borderColor: primaryColor }]} 
                onPress={() => pickImage('aadhar')}
                disabled={uploadingImage === 'aadhar'}
              >
                {formData.aadharImage ? (
                  <View style={styles.aadharPreviewContainer}>
                    <RNImage source={{ uri: formData.aadharImage }} style={styles.aadharPreview} resizeMode="cover" />
                    <View style={styles.aadharSuccess}>
                      <Ionicons name="checkmark-circle" size={24} color={primaryColor} />
                      <Text style={[styles.aadharText, { color: primaryColor }]}>Aadhar Uploaded</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.aadharPlaceholder}>
                    {uploadingImage === 'aadhar' ? (
                      <ActivityIndicator color={primaryColor} />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={40} color="#64748b" />
                        <Text style={styles.aadharText}>Tap to upload Aadhar Card</Text>
                      </>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: primaryColor }]}
              onPress={handleRegister}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Application</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.disclaimer}>
              By submitting, you agree to undergo a background verification process.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* City Selection Modal */}
      <Modal visible={showCityModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select City</Text>
              <TouchableOpacity onPress={() => setShowCityModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={cities}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.cityItem}
                  onPress={() => {
                    setFormData({ ...formData, city: item.name });
                    setShowCityModal(false);
                  }}
                >
                  <Text style={styles.cityItemText}>{item.name}</Text>
                  {formData.city === item.name && (
                    <Ionicons name="checkmark" size={20} color={primaryColor} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginLeft: 15,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: '#f8fafc',
  },
  profileImageSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    backgroundColor: '#f8fafc',
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  profileImageContainer: {
    position: 'relative',
  },
  profileImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  profilePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    marginTop: 4,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#111827',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  profileInfo: {
    marginLeft: 20,
  },
  profileTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  profileSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  aadharUpload: {
    height: 180,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },
  aadharPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aadharText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 10,
  },
  aadharPreviewContainer: {
    flex: 1,
  },
  aadharPreview: {
    width: '100%',
    height: '100%',
    opacity: 0.7,
  },
  aadharSuccess: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  selector: {
    height: 56,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
  },
  selectorText: {
    fontSize: 16,
    color: '#1e293b',
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  serviceChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  serviceChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  footer: {
    marginTop: 30,
  },
  submitButton: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 16,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '80%',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  cityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  cityItemText: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '600',
  },
});
