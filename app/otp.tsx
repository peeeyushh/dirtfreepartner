import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { auth } from '../lib/firebase';
import { PhoneAuthProvider, signInWithCredential } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import ErrorModal from '../components/ErrorModal';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

export default function OtpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const phone = params.phone as string;
  const verificationId = params.verificationId as string;
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const [step, setStep] = useState<'otp' | 'verified'>('otp');
  const [isVerifying, setIsVerifying] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(25);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const primaryColor = '#111827';
  const textColor = '#111827';
  const borderColor = '#d1d5db';

  useEffect(() => {
    let timer: any;
    if (step === 'otp' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  const handleOtpChange = (text: string, index: number) => {
    const numericText = text.replace(/[^0-9]/g, '');
    if (numericText === '' && text !== '') return;

    const newOtp = [...otp];
    newOtp[index] = numericText;
    setOtp(newOtp);

    if (text !== '' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (index === 5 && text !== '' && newOtp.every((val) => val !== '')) {
      handleVerify();
    }
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && otp[index] === '' && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpCode = otp.join('');
    if (otpCode.length === 6) {
      setIsVerifying(true);
      try {
        const credential = PhoneAuthProvider.credential(verificationId, otpCode);
        await signInWithCredential(auth, credential);
        setStep('verified');
      } catch (err: any) {
        console.log('OTP Verification Failed:', err.message);
        setShowErrorModal(true);
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const handleContinue = () => {
    if (!profile) return;

    if (profile.status === 'approved') {
      router.replace('/(tabs)');
    } else if (profile.status === 'pending') {
      router.replace('/pending');
    } else if (profile.status === 'none') {
      router.push('/register');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {step === 'otp' && (
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
            >
              <Ionicons name="arrow-back" size={24} color={textColor} />
            </TouchableOpacity>
          </View>
        )}

        {step === 'otp' ? (
          <View 
            key="otp-step"
            style={styles.content}
          >
            <Text style={styles.title}>Enter OTP</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 30 }}>
              <Text style={{ fontSize: 15, color: '#6b7280' }}>Sent to +91 {phone}  </Text>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={{ color: primaryColor, fontWeight: '600' }}>Change</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.otpContainer}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    inputRefs.current[index] = ref;
                  }}
                  style={[
                    styles.otpBox,
                    { borderColor: digit ? primaryColor : borderColor },
                  ]}
                  keyboardType="number-pad"
                  maxLength={1}
                  value={digit}
                  onChangeText={(text) => handleOtpChange(text, index)}
                  onKeyPress={(e) => handleOtpKeyPress(e, index)}
                  textAlign="center"
                />
              ))}
            </View>

            <View style={styles.resendContainer}>
              <Text style={styles.resendText}>
                {countdown > 0 ? (
                  <Text>Resend OTP in 00:{countdown.toString().padStart(2, '0')}</Text>
                ) : (
                  <TouchableOpacity onPress={() => setCountdown(25)}>
                    <Text style={{ color: primaryColor, fontWeight: '600' }}>Resend OTP</Text>
                  </TouchableOpacity>
                )}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: primaryColor, marginTop: 40 },
                (!otp.every(val => val !== '') || isVerifying) && { opacity: 0.5 },
              ]}
              onPress={handleVerify}
              disabled={!otp.every(val => val !== '') || isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.actionButtonText}>Verify</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View 
            key="verified-step"
            style={styles.verifiedContainer}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ alignItems: 'center' }}>
                <View style={styles.shieldBackground}>
                  <Ionicons 
                    name={profile?.status === 'approved' ? "shield-checkmark" : "person-add"} 
                    size={100} 
                    color={profile?.status === 'approved' ? "#10b981" : primaryColor} 
                  />
                </View>
                <Text style={styles.verifiedTitle}>
                  {profile?.status === 'approved' ? 'Verified!' : 'Welcome!'}
                </Text>
                <Text style={styles.verifiedSubtitle}>
                  {profile?.status === 'approved' 
                    ? 'Your number has been successfully verified.' 
                    : profile?.status === 'pending'
                    ? 'Your application is currently under review.'
                    : 'Verify your identity to start your journey as a partner.'}
                </Text>
              </View>
            </View>
            <View style={{ width: '100%' }}
            >
              <TouchableOpacity
                style={[
                  styles.actionButton, 
                  { backgroundColor: primaryColor, width: '100%', marginBottom: 20 },
                ]}
                onPress={handleContinue}
              >
                <Text style={styles.actionButtonText}>
                  {profile?.status === 'approved' 
                    ? 'Continue to App' 
                    : profile?.status === 'pending'
                    ? 'Check Status'
                    : 'Register as Partner'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
      <ErrorModal 
        visible={showErrorModal} 
        onClose={() => {
          setShowErrorModal(false);
          setOtp(['', '', '', '', '', '']);
        }} 
      />
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
    paddingTop: 10,
    paddingBottom: 20,
  },
  backButton: {
    padding: 4,
    marginLeft: -4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 10,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 30,
  },
  otpBox: {
    width: 45,
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  resendContainer: {
    alignItems: 'center',
  },
  resendText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  actionButton: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  verifiedContainer: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  shieldBackground: {
    marginBottom: 24,
  },
  verifiedTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  verifiedSubtitle: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: '80%',
  },
});
