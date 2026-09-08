import { createContext, useState, useEffect } from 'react';
import {
  auth,
  db,
  googleProvider,
  firebaseConfig,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPhoneNumber,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  isFirebaseConfigured
} from '../utils/firebase';
import {
  ROLES,
  PREDEFINED_ADMIN_EMAIL,
  isElevatedRole,
  isValidRole,
  getHomeRouteForRole
} from '../utils/roles';

async function withTimeout(promise, ms = 8000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

const AuthContext = createContext(null);
export { AuthContext };

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(() => isFirebaseConfigured() && Boolean(auth));

  // Sync session with Firebase Auth and Firestore role data
  useEffect(() => {
    if (!isFirebaseConfigured() || !auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const browserState = typeof navigator !== 'undefined' ? (navigator.onLine ? 'ONLINE' : 'OFFLINE') : 'UNKNOWN';
        const docPath = `users/${firebaseUser.uid}`;
        console.log('[AUTH DIAGNOSTIC] [onAuthStateChanged]', {
          projectId: firebaseConfig?.projectId,
          authenticatedUid: firebaseUser.uid,
          email: firebaseUser.email,
          documentPath: docPath,
          browserState,
        });
        try {
          if (db) {
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            console.log(`[AUTH DIAGNOSTIC] Reading Firestore document at path: "${docPath}" ...`);
            const userSnap = await withTimeout(getDoc(userDocRef), 8000);
            const docExists = userSnap.exists();
            console.log('[AUTH DIAGNOSTIC] Firestore read result:', {
              projectId: firebaseConfig?.projectId,
              documentPath: docPath,
              readSuccess: true,
              exists: docExists,
              data: docExists ? userSnap.data() : null,
            });
            if (docExists) {
              const data = userSnap.data();
              console.log(`[AUTH DIAGNOSTIC] Stored role in "${docPath}": "${data?.role}" (isAdmin: ${data?.role === 'admin'})`);
              if (isValidRole(data.role)) {
                setUserProfile({ uid: firebaseUser.uid, ...data });
              } else {
                console.warn(`[AUTH DIAGNOSTIC] Role "${data?.role}" in "${docPath}" is invalid.`);
                // If role is invalid or missing, do NOT elevate; treat as unauthorized/incomplete
                setUserProfile({
                  ...data,
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || '',
                  displayName: firebaseUser.displayName || 'Unassigned User',
                  role: null
                });
              }
            } else {
              console.log(`[AUTH DIAGNOSTIC] Document at path "${docPath}" does NOT exist in Firestore.`);
              // Unprovisioned new user: recognize predefined admin account or fallback to default worker only
              const isAdminEmail = firebaseUser.email?.toLowerCase() === PREDEFINED_ADMIN_EMAIL.toLowerCase();
              const initialRole = isAdminEmail ? ROLES.ADMIN : ROLES.WORKER;
              const initialProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || (isAdminEmail ? 'Plant Administrator' : 'Field Operator'),
                department: isAdminEmail ? 'Refinery Management / IT' : 'Operations',
                role: initialRole,
                photoURL: firebaseUser.photoURL || null,
                phoneNumber: firebaseUser.phoneNumber || null,
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp()
              };
              await setDoc(userDocRef, initialProfile).catch(() => {});
              setUserProfile(initialProfile);
            }
          } else {
            const isAdminEmail = firebaseUser.email?.toLowerCase() === PREDEFINED_ADMIN_EMAIL.toLowerCase();
            setUserProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || (isAdminEmail ? 'Plant Administrator' : 'Field Operator'),
              department: isAdminEmail ? 'Refinery Management / IT' : 'Operations',
              role: isAdminEmail ? ROLES.ADMIN : ROLES.WORKER,
              photoURL: firebaseUser.photoURL || null,
              phoneNumber: firebaseUser.phoneNumber || null
            });
          }
        } catch (err) {
          console.error('[AUTH DIAGNOSTIC] Firestore read FAILURE in onAuthStateChanged:', {
            projectId: firebaseConfig?.projectId,
            authenticatedUid: firebaseUser.uid,
            documentPath: docPath,
            readSuccess: false,
            errorCode: err?.code || 'UNKNOWN',
            errorMessage: err?.message || String(err),
            browserState: typeof navigator !== 'undefined' ? (navigator.onLine ? 'ONLINE' : 'OFFLINE') : 'UNKNOWN',
          });
          // Do NOT demote to worker; keep role null so unauthorized access is blocked safely
          setUserProfile({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'Unverified User',
            role: null,
            error: err?.message || String(err)
          });
        }
        setCurrentUser(firebaseUser);
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  /**
   * Public Registration: MUST NEVER create an admin, safety_officer, or supervisor account.
   * Only Worker accounts (role = 'worker') can be created via public registration.
   */
  const signUp = async (email, password, name, role = ROLES.WORKER) => {
    if (!auth) throw new Error('Firebase Auth is not initialized');

    if (isElevatedRole(role)) {
      throw new Error('ELEVATED_REGISTRATION_FORBIDDEN');
    }

    const assignedRole = ROLES.WORKER;

    const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const user = userCredential.user;

    const displayName = name.trim() || 'Field Operator';
    await updateProfile(user, { displayName });

    const newProfile = {
      uid: user.uid,
      email: user.email,
      displayName,
      role: assignedRole,
      photoURL: user.photoURL || null,
      phoneNumber: user.phoneNumber || null,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    };

    if (db) {
      try {
        await setDoc(doc(db, 'users', user.uid), newProfile);
      } catch (e) {
        console.warn('[AuthContext] Could not write user profile to Firestore:', e);
      }
    }

    setUserProfile(newProfile);
    setCurrentUser(user);
    return { user, profile: newProfile };
  };

  /**
   * Email/Password Sign In: Read role strictly from Firestore users/{uid}.
   * NEVER overwrite the stored role based on the login-page selection.
   */
  const signIn = async (email, password, expectedRole = ROLES.WORKER) => {
    if (!auth) throw new Error('Firebase Auth is not initialized');

    console.log('[AUTH DIAGNOSTIC] 1. Initiating signInWithEmailAndPassword for email:', email, 'profile selected:', expectedRole);
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const user = userCredential.user;
    console.log('[AUTH DIAGNOSTIC] 1. Firebase signInWithEmailAndPassword SUCCEEDED!');
    console.log('[AUTH DIAGNOSTIC] 2. Authenticated user UID:', user.uid);

    let profile = null;
    if (db) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        console.log('[AUTH DIAGNOSTIC] Reading Firestore doc: users/' + user.uid);
        const userSnap = await withTimeout(getDoc(userDocRef), 8000);

        const docExists = userSnap.exists();
        console.log('[AUTH DIAGNOSTIC] 3. users/{uid} found in Firestore?:', docExists);

        if (docExists) {
          profile = { uid: user.uid, ...userSnap.data() };
          const storedRole = profile.role || null;
          console.log('[AUTH DIAGNOSTIC] 4. Role returned from Firestore:', storedRole);
          console.log('[AUTH DIAGNOSTIC] 5. Is role exactly "admin"?:', storedRole === 'admin');

          if (!isValidRole(storedRole)) {
            console.warn('[AUTH DIAGNOSTIC] NO_ROLE_ASSIGNED. storedRole:', storedRole);
            await firebaseSignOut(auth);
            setCurrentUser(null);
            setUserProfile(null);
            throw new Error('NO_ROLE_ASSIGNED');
          }

          // Login-page role is ONLY an access profile selection. Verify match without altering stored role!
          if (storedRole !== expectedRole) {
            console.warn(`[AUTH DIAGNOSTIC] ROLE_MISMATCH: storedRole (${storedRole}) !== expectedRole (${expectedRole})`);
            await firebaseSignOut(auth);
            setCurrentUser(null);
            setUserProfile(null);
            throw new Error(`ROLE_MISMATCH:${storedRole}`);
          }
          // Do NOT overwrite role, only update last login timestamp
          await updateDoc(userDocRef, { lastLoginAt: serverTimestamp() }).catch(() => {});
        } else {
          console.log('[AUTH DIAGNOSTIC] 3. users/' + user.uid + ' document NOT found in Firestore.');
          const isAdminEmail = user.email?.toLowerCase() === PREDEFINED_ADMIN_EMAIL.toLowerCase();

          // If attempting elevated access, allow only the predefined Admin account
          if (isElevatedRole(expectedRole)) {
            if (isAdminEmail && expectedRole === ROLES.ADMIN) {
              profile = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || 'Plant Administrator',
                department: 'Refinery Management / IT',
                role: ROLES.ADMIN,
                photoURL: user.photoURL || null,
                phoneNumber: user.phoneNumber || null,
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp()
              };
              await setDoc(userDocRef, profile).catch(() => {});
            } else {
              console.warn('[AUTH DIAGNOSTIC] Elevated access rejected: No Firestore document and not predefined admin email.');
              await firebaseSignOut(auth);
              setCurrentUser(null);
              setUserProfile(null);
              throw new Error('NO_ELEVATED_RECORD');
            }
          } else {
            // Default unprovisioned account: only allow worker role
            profile = {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName || 'Field Operator',
              department: 'Operations',
              role: ROLES.WORKER,
              photoURL: user.photoURL || null,
              phoneNumber: user.phoneNumber || null,
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp()
            };
            await setDoc(userDocRef, profile).catch(() => {});
          }
        }
      } catch (err) {
        const browserState = typeof navigator !== 'undefined' ? (navigator.onLine ? 'ONLINE' : 'OFFLINE') : 'UNKNOWN';
        console.error('[AUTH DIAGNOSTIC] 8. Firestore read FAILURE in signIn:', {
          projectId: firebaseConfig?.projectId,
          authenticatedUid: user.uid,
          documentPath: `users/${user.uid}`,
          readSuccess: false,
          errorCode: err?.code || 'UNKNOWN',
          errorMessage: err?.message || String(err),
          browserState
        });
        throw err;
      }
    }

    if (!profile) {
      const isAdminEmail = user.email?.toLowerCase() === PREDEFINED_ADMIN_EMAIL.toLowerCase();
      if (isAdminEmail && expectedRole === ROLES.ADMIN) {
        profile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'Plant Administrator',
          department: 'Refinery Management / IT',
          role: ROLES.ADMIN
        };
      } else if (isElevatedRole(expectedRole)) {
        await firebaseSignOut(auth);
        setCurrentUser(null);
        setUserProfile(null);
        throw new Error('NO_ELEVATED_RECORD');
      } else {
        profile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'Field Operator',
          department: 'Operations',
          role: ROLES.WORKER
        };
      }
    }

    setUserProfile(profile);
    setCurrentUser(user);
    return { user, profile };
  };

  /**
   * Google SSO: Read stored role from Firestore users/{uid}.
   * Public Google sign-in NEVER creates an elevated account.
   */
  const signInWithGoogle = async (expectedRole = ROLES.WORKER) => {
    if (!auth || !googleProvider) throw new Error('Firebase Auth or Google Provider is not initialized');

    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    let profile = null;
    if (db) {
      const userDocRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        profile = userSnap.data();
        const storedRole = profile.role || null;

        if (!isValidRole(storedRole)) {
          await firebaseSignOut(auth);
          setCurrentUser(null);
          setUserProfile(null);
          throw new Error('NO_ROLE_ASSIGNED');
        }

        if (storedRole !== expectedRole) {
          await firebaseSignOut(auth);
          setCurrentUser(null);
          setUserProfile(null);
          throw new Error(`ROLE_MISMATCH:${storedRole}`);
        }
        await updateDoc(userDocRef, { lastLoginAt: serverTimestamp() }).catch(() => {});
      } else {
        // First-time Google user: Elevated roles cannot be created via public Google sign-in
        if (isElevatedRole(expectedRole)) {
          await firebaseSignOut(auth);
          setCurrentUser(null);
          setUserProfile(null);
          throw new Error('NO_ELEVATED_RECORD');
        }

        profile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || 'Field Operator',
          role: ROLES.WORKER,
          photoURL: user.photoURL || null,
          phoneNumber: user.phoneNumber || null,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        };
        await setDoc(userDocRef, profile).catch(() => {});
      }
    }

    if (!profile) {
      if (isElevatedRole(expectedRole)) {
        await firebaseSignOut(auth);
        setCurrentUser(null);
        setUserProfile(null);
        throw new Error('NO_ELEVATED_RECORD');
      }
      profile = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || 'Field Operator',
        role: ROLES.WORKER,
        photoURL: user.photoURL || null
      };
    }

    setUserProfile(profile);
    setCurrentUser(user);
    return { user, profile };
  };

  /**
   * Phone SMS OTP: Send verification code
   */
  const sendPhoneOtp = async (phoneNumber, verifier) => {
    if (!auth) throw new Error('Firebase Auth is not initialized');
    return await signInWithPhoneNumber(auth, phoneNumber, verifier);
  };

  /**
   * Phone SMS OTP: Confirm 6-digit code with Firestore Role Verification.
   * Public Phone verification NEVER creates an elevated account.
   */
  const verifyPhoneOtp = async (confirmationResult, otpCode, expectedRole = ROLES.WORKER) => {
    if (!confirmationResult) throw new Error('No OTP confirmation session active');

    const result = await confirmationResult.confirm(otpCode);
    const user = result.user;

    let profile = null;
    if (db) {
      const userDocRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        profile = userSnap.data();
        const storedRole = profile.role || null;

        if (!isValidRole(storedRole)) {
          await firebaseSignOut(auth);
          setCurrentUser(null);
          setUserProfile(null);
          throw new Error('NO_ROLE_ASSIGNED');
        }

        if (storedRole !== expectedRole) {
          await firebaseSignOut(auth);
          setCurrentUser(null);
          setUserProfile(null);
          throw new Error(`ROLE_MISMATCH:${storedRole}`);
        }
        await updateDoc(userDocRef, { lastLoginAt: serverTimestamp() }).catch(() => {});
      } else {
        // First-time Phone user: Elevated role cannot be created via public Phone sign-in
        if (isElevatedRole(expectedRole)) {
          await firebaseSignOut(auth);
          setCurrentUser(null);
          setUserProfile(null);
          throw new Error('NO_ELEVATED_RECORD');
        }

        profile = {
          uid: user.uid,
          email: user.email || `mobile.${user.phoneNumber?.slice(-4) || 'user'}@refinery.internal`,
          displayName: `Worker (${user.phoneNumber?.slice(-4) || 'Field'})`,
          role: ROLES.WORKER,
          phoneNumber: user.phoneNumber,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp()
        };
        await setDoc(userDocRef, profile).catch(() => {});
      }
    }

    if (!profile) {
      if (isElevatedRole(expectedRole)) {
        await firebaseSignOut(auth);
        setCurrentUser(null);
        setUserProfile(null);
        throw new Error('NO_ELEVATED_RECORD');
      }
      profile = {
        uid: user.uid,
        email: user.email || `mobile.${user.phoneNumber?.slice(-4) || 'user'}@refinery.internal`,
        displayName: 'Field Operator',
        role: ROLES.WORKER,
        phoneNumber: user.phoneNumber
      };
    }

    setUserProfile(profile);
    setCurrentUser(user);
    return { user, profile };
  };

  /**
   * Sign Out
   */
  const signOut = async () => {
    if (auth) {
      try {
        await firebaseSignOut(auth);
      } catch (e) {
        console.error('[AuthContext] Sign out error:', e);
      }
    }
    setCurrentUser(null);
    setUserProfile(null);
  };

  /**
   * Password Reset Email
   */
  const resetPassword = async (email) => {
    if (!auth) throw new Error('Firebase Auth is not initialized');
    return await sendPasswordResetEmail(auth, email.trim());
  };

  const role = userProfile?.role || null;
  const isAdmin = role === ROLES.ADMIN;
  const isSafetyOfficer = role === ROLES.SAFETY_OFFICER;
  const isSupervisor = role === ROLES.SUPERVISOR;
  const isWorker = role === ROLES.WORKER;

  const hasRole = (roleOrRoles) => {
    if (!role) return false;
    if (Array.isArray(roleOrRoles)) {
      return roleOrRoles.includes(role);
    }
    return role === roleOrRoles;
  };

  const value = {
    currentUser,
    userProfile,
    role,
    isAdmin,
    isSafetyOfficer,
    isSupervisor,
    isWorker,
    hasRole,
    homeRoute: getHomeRouteForRole(role),
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    signOut,
    resetPassword
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
