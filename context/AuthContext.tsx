import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { auth, db } from '../lib/firebase';

export type PartnerStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface PartnerProfile {
  uid: string;
  phoneNumber: string | null;
  firstName?: string;
  lastName?: string;
  email?: string;
  profileImage?: string;
  status: PartnerStatus;
  isOnline?: boolean;
  createdAt: number;
  averageRating?: number;
  totalRatings?: number;
  vacationMode?: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: PartnerProfile | null;
  loading: boolean;
  updateProfile: (data: Partial<PartnerProfile>) => Promise<void>;
  signOut: () => Promise<void>;
  setProfileState: (profile: PartnerProfile | null) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (uid: string) => {
    try {
      const docRef = doc(db, 'partners', uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfile({
          ...data,
          status: data.status || 'pending'
        } as PartnerProfile);
      } else {
        console.log('No partner profile found in Firestore for UID:', uid);
        setProfile({
          uid,
          phoneNumber: auth.currentUser?.phoneNumber || null,
          status: 'none',
          createdAt: Date.now()
        });
      }
    } catch (error: any) {
      console.log('Partner profile fetch error/refused - using default:', error.message);
      setProfile({
        uid,
        phoneNumber: auth.currentUser?.phoneNumber || null,
        status: 'none',
        createdAt: Date.now()
      });
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.uid);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Real-time profile listener
        const profileRef = doc(db, 'partners', firebaseUser.uid);
        profileUnsubscribe = onSnapshot(profileRef, (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            setProfile({
              ...data,
              status: data.status || 'pending'
            } as PartnerProfile);
          } else {
            setProfile({
              uid: firebaseUser.uid,
              phoneNumber: firebaseUser.phoneNumber || null,
              status: 'none',
              createdAt: Date.now()
            } as PartnerProfile);
          }
          setLoading(false);
        }, (error) => {
          console.error("Profile snapshot error:", error);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);


  const updateProfile = useCallback(async (data: Partial<PartnerProfile>) => {
    const uidToUse = user?.uid || profile?.uid;
    const phoneToUse = user?.phoneNumber || profile?.phoneNumber;
    if (!uidToUse) return;

    try {
      const docRef = doc(db, 'partners', uidToUse);
      await setDoc(docRef, { 
        ...data, 
        uid: uidToUse,
        phoneNumber: phoneToUse,
        updatedAt: Date.now() 
      }, { merge: true });

      setProfile(prev => prev ? { ...prev, ...data } : { 
        ...data as PartnerProfile,
        uid: uidToUse, 
        phoneNumber: phoneToUse || null, 
        createdAt: Date.now() 
      } as PartnerProfile);
      
    } catch (error: any) {
      if (error.code !== 'permission-denied') {
        console.error('Error updating partner profile:', error);
        throw error;
      }
    }
  }, [user?.uid, user?.phoneNumber, profile?.uid, profile?.phoneNumber]);

  const signOut = useCallback(async () => {
    try {
      setLoading(true);
      setProfile(null);
      setUser(null);
      await auth.signOut();
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(() => ({
    user,
    profile,
    loading,
    updateProfile,
    signOut,
    setProfileState: setProfile,
    refreshProfile
  }), [user, profile, loading, updateProfile, signOut, refreshProfile]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator size="large" color="#006D44" />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
