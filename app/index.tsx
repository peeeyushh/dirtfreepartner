import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Pressable
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FirebaseRecaptchaVerifierModal } from '../components/FirebaseRecaptcha';
import { signInWithPhoneNumber } from 'firebase/auth';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import Animated, { 
  FadeInUp, 
  FadeIn, 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
} from 'react-native-reanimated';
import { app, auth } from '../lib/firebase';
import ErrorModal from '../components/ErrorModal';
import { useAuth } from '../context/AuthContext';

export default function EntryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const recaptchaVerifier = useRef(null);
  
  const { user, profile, loading } = useAuth();

  React.useEffect(() => {
    if (!loading && user && profile) {
      if (profile.status === 'approved' || profile.status === 'pending') {
        router.replace('/(tabs)');
      } else if (profile.status === 'rejected') {
        router.replace('/pending');
      } else if (profile.status === 'none') {
        router.replace('/register');
      }
    }
  }, [user, profile, loading, router]);
  
  const scale = useSharedValue(1);
  const firebaseConfig = app ? app.options : {};

  const primaryColor = '#111827';

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.96);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const handleContinue = async () => {
    if (phoneNumber.length === 10) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsSending(true);
      try {
        const fullPhoneNumber = `+91${phoneNumber}`;
        const confirmationResult = await signInWithPhoneNumber(
          auth,
          fullPhoneNumber,
          recaptchaVerifier.current as any
        );
        
        setIsSending(false);
        router.push({
          pathname: '/otp',
          params: { phone: phoneNumber, verificationId: confirmationResult.verificationId },
        });
      } catch (error: any) {
        setIsSending(false);
        console.error('Error sending OTP:', error);
        setErrorMessage(error.message || 'Failed to send OTP. Please try again.');
        setShowError(true);
      }
    }
  };

  const openWebPage = useCallback((url: string) => {
    Linking.openURL(url);
  }, []);

  if (user && profile) {
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar style="dark" />
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        firebaseConfig={firebaseConfig}
        attemptInvisibleVerification={!__DEV__}
        appVerificationDisabledForTesting={__DEV__}
      />
      
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollGrow}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Image Section */}
          <View style={styles.heroSection}
          >
            <Image 
              source={require('../assets/images/onboarding_3_1777289809909.png')} 
              style={[styles.heroImage, { width }]} 
              contentFit="cover"
              transition={1000}
            />
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.8)', '#ffffff']}
              style={styles.gradientOverlay}
            />
          </View>

          <View style={styles.contentContainer}>
            <View>
              <Text style={styles.brandName}>DirtFree Partner</Text>
              <Text style={styles.tagline}>Grow your business with us.</Text>
            </View>
            
            <View style={styles.inputSection}
            >
              <Text style={styles.label}>Enter your mobile number</Text>
              <View style={styles.phoneInputContainer}>
                <View style={styles.countryCode}>
                  <Text style={styles.countryCodeText}>+91</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="00000 00000"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phoneNumber}
                  onChangeText={(text) => {
                    if (text.length === 1) Haptics.selectionAsync();
                    setPhoneNumber(text.replace(/[^0-9]/g, ''));
                  }}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            <View>
              <Pressable
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={handleContinue}
                disabled={phoneNumber.length < 10 || isSending}
              >
                <View
                  style={[
                    styles.button,
                    { backgroundColor: primaryColor },
                    phoneNumber.length < 10 && { opacity: 0.6 }
                  ]}
                >
                  {isSending ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.buttonText}>Continue</Text>
                  )}
                </View>
              </Pressable>
            </View>

            <View style={styles.footer}
            >
              <Text style={styles.footerText}>
                By continuing, you agree to our{' '}
                <Text style={styles.link} onPress={() => openWebPage('https://dirtfree.com/partner-terms')}>Partner Terms</Text>
                {' '}&{' '}
                <Text style={styles.link} onPress={() => openWebPage('https://dirtfree.com/privacy')}>Privacy Policy</Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ErrorModal 
        visible={showError}
        onClose={() => setShowError(false)}
        message={errorMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollGrow: {
    flexGrow: 1,
  },
  heroSection: {
    height: 400,
    position: 'relative',
  },
  heroImage: {
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 30,
    paddingTop: 20,
    paddingBottom: 40,
    backgroundColor: '#ffffff',
  },
  brandName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  inputSection: {
    marginTop: 40,
    marginBottom: 30,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    height: 60,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
  },
  countryCode: {
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    paddingRight: 12,
    marginRight: 12,
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: 1,
  },
  button: {
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 30,
  },
  footerText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },
  link: {
    color: '#111827',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
