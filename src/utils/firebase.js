import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit
} from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDXUVO3bvWxa4x1fbkMZJLeNTS_j9Rs5gg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "h2s-dosimeter-44756.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "h2s-dosimeter-44756",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "h2s-dosimeter-44756.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "704373987548",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:704373987548:web:8cff3dfd92f5258c5f7c19",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-SS5RN3SF8L"
};

/**
 * Checks whether valid Firebase credentials have been configured
 */
export const isFirebaseConfigured = () => {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.apiKey.trim().length > 10 &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId.trim().length > 0
  );
};

let app = null;
let auth = null;
let db = null;
let googleProvider = null;
let analytics = null;

if (isFirebaseConfigured()) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    try {
      db = initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true
      });
    } catch {
      db = getFirestore(app);
    }
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });

    // Initialize Analytics if supported in current browser environment
    if (typeof window !== 'undefined') {
      isSupported().then((supported) => {
        if (supported) {
          analytics = getAnalytics(app);
        }
      }).catch(() => {
        // Analytics not supported or blocked by client (e.g. adblocker)
      });
    }
  } catch (err) {
    console.warn('[Firebase] Initialization error:', err);
  }
}

export {
  app,
  auth,
  db,
  googleProvider,
  analytics,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit
};

/**
 * Translates Firebase Auth error codes into clear, actionable human messages
 */
export const mapFirebaseAuthError = (error) => {
  if (!error) return 'An unexpected error occurred.';
  const code = error.code || '';
  const message = error.message || '';

  // Custom role validation errors (4 Roles: admin, safety_officer, supervisor, worker)
  if (message.startsWith('ROLE_MISMATCH:worker') || code === 'custom/role-mismatch-worker') {
    return 'Access denied: This account is registered as a Worker. Please switch to the Worker profile to sign in.';
  }
  if (message.startsWith('ROLE_MISMATCH:supervisor') || code === 'custom/role-mismatch-supervisor') {
    return 'Access denied: This account is registered as a Supervisor. Please switch to the Supervisor profile to sign in.';
  }
  if (message.startsWith('ROLE_MISMATCH:safety_officer') || code === 'custom/role-mismatch-safety_officer') {
    return 'Access denied: This account is registered as a Safety Officer. Please switch to the Safety Officer profile to sign in.';
  }
  if (message.startsWith('ROLE_MISMATCH:admin') || code === 'custom/role-mismatch-admin') {
    return 'Access denied: This account is registered as an Admin. Please switch to the Admin profile to sign in.';
  }
  if (message === 'ELEVATED_REGISTRATION_FORBIDDEN' || message === 'ADMIN_REGISTRATION_FORBIDDEN' || code === 'custom/elevated-registration-forbidden') {
    return 'Public registration for elevated accounts is restricted. Admin, Safety Officer, and Supervisor accounts must be provisioned manually by refinery management.';
  }
  if (message === 'NO_ELEVATED_RECORD' || message === 'NO_ADMIN_RECORD' || code === 'custom/no-elevated-record') {
    return 'Access denied: No elevated profile found for this account. Please sign in as a Worker or contact refinery administration.';
  }
  if (message === 'NO_ROLE_ASSIGNED' || code === 'custom/no-role-assigned') {
    return 'Access restricted: No valid role assigned to this user profile in the database.';
  }

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Invalid email or password. Please verify your credentials.';
    case 'auth/user-not-found':
      return 'No registered account found with this email. Please click "Create Account".';
    case 'auth/email-already-in-use':
      return 'An account is already registered with this email. Please Sign In.';
    case 'auth/invalid-email':
      return 'Please enter a valid corporate or refinery email address.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/invalid-verification-code':
      return 'Incorrect 6-digit SMS verification code. Please check your SMS and try again.';
    case 'auth/code-expired':
      return 'The SMS verification code has expired. Please click "Resend OTP Code".';
    case 'auth/invalid-phone-number':
      return 'Invalid phone number format. Please ensure you entered a valid 10-digit number.';
    case 'auth/too-many-requests':
      return 'Access temporarily restricted due to multiple failed attempts. Please wait a moment.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing authentication.';
    case 'auth/popup-blocked':
      return 'The sign-in popup was blocked by your browser. Please allow popups for this site.';
    case 'auth/unauthorized-domain':
      return 'Domain not authorized for OAuth in Firebase Console. Please add current domain to Authorized Domains.';
    case 'auth/network-request-failed':
      return 'Network connection issue. Please check your internet connection.';
    case 'auth/quota-exceeded':
      return 'SMS OTP daily limit exceeded. Please try again later or use Email/Google login.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in your Firebase Console. Please enable it under Auth Providers.';
    case 'permission-denied':
      return 'Database access denied. Please verify your Firestore security rules.';
    case 'unavailable':
      if (message.includes('client is offline')) {
        return 'Cloud Firestore backend is offline or uninitialized. In Firebase Console for project "h2s-dosimeter-44756", ensure Cloud Firestore is enabled and database is created.';
      }
      return 'Database service temporarily unavailable. Please verify network connection and Firebase project status.';
    default:
      return error.message || 'Authentication failed. Please try again.';
  }
};
