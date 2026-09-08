import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import {
  auth,
  RecaptchaVerifier,
  isFirebaseConfigured,
  mapFirebaseAuthError
} from '../utils/firebase';
import {
  ROLES,
  LOGIN_PROFILES,
  isValidRole,
  isElevatedRole,
  getRoleMetadata,
  getHomeRouteForRole
} from '../utils/roles';

export default function LoginPage({ onLoginSuccess }) {
  const navigate = useNavigate();
  const {
    currentUser,
    role: userRole,
    signIn,
    signUp,
    signInWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    resetPassword
  } = useAuth();

  // Selected role profile: 'worker' | 'admin'
  const [role, setRole] = useState(ROLES.WORKER);

  // Mode: 'signin' | 'signup'
  const [authMode, setAuthMode] = useState('signin');

  // Sign In Method: 'email' | 'mobile'
  const [signInMethod, setSignInMethod] = useState('email');

  // Email form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Mobile OTP form state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const otpInputRefs = useRef([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);

  const firebaseActive = isFirebaseConfigured() && Boolean(auth);
  const activeRoleMeta = getRoleMetadata(role);

  // If already authenticated with Firebase, redirect directly to user portal once role is resolved
  useEffect(() => {
    if (currentUser && userRole && isValidRole(userRole)) {
      const targetRoute = getHomeRouteForRole(userRole);
      console.log('[AUTH DIAGNOSTIC] 6. Auto-redirecting authenticated user to route:', targetRoute, 'for role:', userRole);
      navigate(targetRoute, { replace: true });
    }
  }, [currentUser, userRole, navigate]);

  // Countdown timer for OTP resend
  const canResend = otpSent && countdown === 0;
  useEffect(() => {
    let timer;
    if (otpSent && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [otpSent, countdown]);

  // Cleanup reCAPTCHA on unmount
  useEffect(() => {
    return () => {
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const themeAccent = activeRoleMeta.color;
  const themeBorder = activeRoleMeta.border;
  const themeSoft = activeRoleMeta.softBg;

  const clearAlerts = () => {
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    clearAlerts();
  };

  const handleAuthModeChange = (mode) => {
    setAuthMode(mode);
    if (mode === 'signup') {
      setRole(ROLES.WORKER);
    }
    clearAlerts();
  };

  const fillDemoAccount = (demoRole) => {
    clearAlerts();
    if (demoRole === ROLES.ADMIN) {
      setRole(ROLES.ADMIN);
      setEmail('admin@refinery.com');
      setPassword('Admin@Refinery2026!');
      setAuthMode('signin');
    } else {
      setRole(ROLES.WORKER);
      setEmail('worker@refinery.com');
      setPassword('Worker@Refinery2026!');
      setName('Ramesh Kumar (EMP-8841)');
    }
  };

  const finalizeLogin = (profile) => {
    if (onLoginSuccess) {
      onLoginSuccess(profile);
    }
    const targetRoute = getHomeRouteForRole(profile?.role);
    console.log('[AUTH DIAGNOSTIC] 6. What route does the application navigate to after login?:', targetRoute, 'for profile role:', profile?.role);
    navigate(targetRoute, { replace: true });
  };

  // ---------------------------------------------------------------------------
  // 1. EMAIL & PASSWORD (REAL FIREBASE AUTH + FIRESTORE ROLES)
  // ---------------------------------------------------------------------------
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    clearAlerts();

    if (!email.trim() || !password) {
      setErrorMsg('Please provide both email and password.');
      return;
    }

    if (authMode === 'signup') {
      if (isElevatedRole(role)) {
        setErrorMsg('Public registration is restricted to Worker accounts. Admin accounts must be provisioned manually by refinery management.');
        return;
      }
      if (!name.trim()) {
        setErrorMsg('Please enter your full name or Employee ID.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match. Please re-enter.');
        return;
      }
    }

    setLoading(true);

    try {
      if (authMode === 'signup') {
        const { profile } = await signUp(email.trim(), password, name.trim(), ROLES.WORKER);
        finalizeLogin(profile);
      } else {
        const { profile } = await signIn(email.trim(), password, role);
        finalizeLogin(profile);
      }
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 2. MOBILE PHONE & REAL SMS OTP (FIREBASE PHONE AUTH)
  // ---------------------------------------------------------------------------
  const initRecaptchaVerifier = () => {
    if (!firebaseActive || !auth) return null;
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: () => {
            // reCAPTCHA solved
          },
          'expired-callback': () => {
            setErrorMsg('reCAPTCHA security verification expired. Please retry.');
          }
        });
      }
      return window.recaptchaVerifier;
    } catch (err) {
      console.warn('reCAPTCHA initialization error:', err);
      return null;
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    clearAlerts();

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setErrorMsg('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);

    try {
      const verifier = initRecaptchaVerifier();
      if (!verifier) {
        throw new Error('Could not initialize SMS verification verifier.');
      }

      const formattedPhone = `+91${cleanPhone}`;
      const confirmation = await sendPhoneOtp(formattedPhone, verifier);
      setConfirmationResult(confirmation);
      setOtpSent(true);
      setCountdown(30);
      setSuccessMsg(`SMS verification code sent to ${formattedPhone}`);

      setTimeout(() => {
        if (otpInputRefs.current[0]) {
          otpInputRefs.current[0].focus();
        }
      }, 100);
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        } catch {
          // ignore
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Auto-advance
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;
    const newOtp = [...otp];
    for (let i = 0; i < pastedData.length; i++) {
      newOtp[i] = pastedData[i];
    }
    setOtp(newOtp);
    const nextIdx = Math.min(pastedData.length, 5);
    otpInputRefs.current[nextIdx]?.focus();
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    clearAlerts();

    const fullOtp = otp.join('');
    if (fullOtp.length !== 6) {
      setErrorMsg('Please enter the complete 6-digit verification code.');
      return;
    }

    setLoading(true);

    try {
      const { profile } = await verifyPhoneOtp(confirmationResult, fullOtp, role);
      finalizeLogin(profile);
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 3. GOOGLE WORKSPACE SSO (REAL OAUTH POPUP + FIRESTORE ROLES)
  // ---------------------------------------------------------------------------
  const handleGoogleSSO = async () => {
    clearAlerts();
    setLoading(true);

    try {
      const { profile } = await signInWithGoogle(role);
      finalizeLogin(profile);
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 4. FORGOT PASSWORD (REAL FIREBASE PASSWORD RESET)
  // ---------------------------------------------------------------------------
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setLoading(true);

    try {
      await resetPassword(forgotEmail.trim());
      setForgotSubmitted(true);
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative flex items-center justify-center p-4 selection:bg-amber-500/20 selection:text-amber-200 overflow-hidden"
      style={{ background: '#0b0f14' }}
    >
      {/* Invisible reCAPTCHA container for Firebase Phone OTP */}
      <div id="recaptcha-container" />

      {/* Ambient background glows tailored to role */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full blur-[140px] pointer-events-none transition-all duration-700 -top-32 -left-32 opacity-25"
        style={{ background: themeAccent }}
      />
      <div
        className="absolute w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none transition-all duration-700 -bottom-24 -right-24 opacity-20"
        style={{ background: themeAccent }}
      />

      <div className="w-full max-w-[480px] relative z-10 flex flex-col items-center">
        {/* Brand Header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center border shadow-lg transition-colors duration-300"
            style={{ background: themeSoft, borderColor: themeBorder, color: themeAccent }}
          >
            <DosimeterBadgeIcon size={22} />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight text-slate-100 flex items-center gap-2">
              H₂S Safestrip
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                SIH26118
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Colorimetric Dosimeter Portal</div>
          </div>
        </div>

        {/* Live Firebase Status Indicator */}
        <div className="mb-3 w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                firebaseActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-300 font-medium">
              {firebaseActive ? 'Firebase Auth: Cloud Connected' : 'Firebase Auth: Dev Mode'}
            </span>
          </div>
          <span className="text-slate-500 font-mono text-[10px]">
            {firebaseActive ? 'Google / Email / SMS' : '.env Config Ready'}
          </span>
        </div>

        {/* Main Card */}
        <div
          className="w-full rounded-2xl border shadow-2xl backdrop-blur-xl p-6 transition-all duration-300"
          style={{ background: 'rgba(20, 25, 32, 0.88)', borderColor: 'rgba(51, 65, 85, 0.65)' }}
        >
          {/* Sign In / Sign Up Mode Tab Header */}
          <div className="flex border-b border-slate-800 mb-5">
            <button
              type="button"
              onClick={() => handleAuthModeChange('signin')}
              className={`flex-1 pb-2.5 text-xs font-semibold tracking-wide text-center border-b-2 transition-all ${
                authMode === 'signin'
                  ? 'border-current'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
              style={{ color: authMode === 'signin' ? themeAccent : undefined }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => handleAuthModeChange('signup')}
              className={`flex-1 pb-2.5 text-xs font-semibold tracking-wide text-center border-b-2 transition-all ${
                authMode === 'signup'
                  ? 'border-current'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
              style={{ color: authMode === 'signup' ? themeAccent : undefined }}
            >
              Create Worker Account
            </button>
          </div>

          {/* Top Role Selector or Signup Worker-Only Lock */}
          {authMode === 'signin' ? (
            <div className="mb-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 px-1 flex items-center justify-between">
                <span>Select Access Profile</span>
                <span className="text-[10px] font-mono text-slate-500">AUTH VERIFIED BY FIRESTORE</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
                {LOGIN_PROFILES.map((cfg) => {
                  const isSelected = role === cfg.id;
                  return (
                    <button
                      key={cfg.id}
                      type="button"
                      onClick={() => handleRoleChange(cfg.id)}
                      className={`flex flex-col items-center py-3 px-3 rounded-lg text-xs font-medium transition-all ${
                        isSelected
                          ? 'border shadow-md'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                      }`}
                      style={
                        isSelected
                          ? {
                              background: cfg.softBg,
                              borderColor: cfg.border,
                              color: cfg.color
                            }
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-lg">{cfg.icon}</span>
                        <span className="font-semibold text-sm">{cfg.label}</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-normal text-center leading-tight">
                        {cfg.subtitle}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Quick Fill Demo Credentials */}
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fillDemoAccount(ROLES.WORKER)}
                  className="flex-1 py-1 px-2 rounded bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10.5px] font-medium transition-colors"
                >
                  Fill Worker Demo
                </button>
                <button
                  type="button"
                  onClick={() => fillDemoAccount(ROLES.ADMIN)}
                  className="flex-1 py-1 px-2 rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-[10.5px] font-medium transition-colors"
                >
                  Fill Admin Account
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs flex items-start gap-2.5">
              <span className="text-base shrink-0">👷</span>
              <div className="text-[11.5px] leading-relaxed text-amber-300">
                <span className="font-semibold">Public Worker Registration:</span> Public sign-up is strictly restricted to Field Operator / Worker accounts. Admin accounts are centrally provisioned by refinery IT.
              </div>
            </div>
          )}

          {/* Dynamic Role Context Banner */}
          <div
            className="mb-5 px-3 py-2 rounded-lg border text-xs flex items-center gap-2.5 transition-colors duration-300"
            style={{ background: themeSoft, borderColor: themeBorder }}
          >
            <span className="text-sm shrink-0">{activeRoleMeta.icon}</span>
            <div className="text-[11.5px] leading-relaxed" style={{ color: themeAccent }}>
              <span className="font-semibold">{activeRoleMeta.label} Mode:</span> {activeRoleMeta.description}
            </div>
          </div>

          {/* Alert feedback */}
          {errorMsg && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-950/50 border border-red-800/70 text-red-300 text-xs flex items-center gap-2 animate-fadeIn">
              <span className="shrink-0 text-sm">⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-950/50 border border-emerald-800/70 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
              <span className="shrink-0 text-sm">✓</span>
              <span>{successMsg}</span>
            </div>
          )}

          {/* Sub-Tabs for Sign In: Email vs Mobile OTP */}
          {authMode === 'signin' && (
            <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-900/60 border border-slate-800/80 mb-4">
              <button
                type="button"
                onClick={() => { setSignInMethod('email'); clearAlerts(); }}
                className={`flex-1 py-1.5 rounded-md text-[11.5px] font-medium transition-all ${
                  signInMethod === 'email'
                    ? 'bg-slate-800 text-slate-100 shadow-sm'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Email & Password
              </button>
              <button
                type="button"
                onClick={() => { setSignInMethod('mobile'); clearAlerts(); }}
                className={`flex-1 py-1.5 rounded-md text-[11.5px] font-medium transition-all ${
                  signInMethod === 'mobile'
                    ? 'bg-slate-800 text-slate-100 shadow-sm'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Mobile & OTP (SMS)
              </button>
            </div>
          )}

          {/* Elevated Account Self-Registration Restriction Notice */}
          {authMode === 'signup' && isElevatedRole(role) ? (
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700 text-center space-y-3">
              <div
                className="w-10 h-10 mx-auto rounded-xl border flex items-center justify-center text-lg shadow-sm"
                style={{ background: themeSoft, borderColor: themeBorder, color: themeAccent }}
              >
                {activeRoleMeta.icon}
              </div>
              <div className="text-xs font-bold text-slate-100">
                Restricted Elevated Account Provisioning
              </div>
              <p className="text-[11.5px] text-slate-400 leading-relaxed">
                {activeRoleMeta.label} accounts cannot be created through public self-registration.
                Elevated credentials must be provisioned directly by refinery management or through an authorized administrator.
              </p>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handleRoleChange(ROLES.WORKER)}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 transition-colors shadow-sm"
                >
                  Register as Worker instead
                </button>
                <button
                  type="button"
                  onClick={() => handleAuthModeChange('signin')}
                  className="text-[11px] hover:underline pt-1"
                  style={{ color: themeAccent }}
                >
                  Already have an assigned {activeRoleMeta.label} account? Sign In
                </button>
              </div>
            </div>
          ) : (
            /* ----------------- AUTH FLOW A: EMAIL & PASSWORD ----------------- */
            (authMode === 'signup' || signInMethod === 'email') && (
              <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                {authMode === 'signup' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Full Name / Employee ID
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar (EMP-8841)"
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/70 transition-colors"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Registered Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@refinery.com"
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/70 transition-colors"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                      {authMode === 'signup' ? 'Create Password (min 6 chars)' : 'Password'}
                    </label>
                    {authMode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => setShowForgotModal(true)}
                        className="text-[11px] hover:underline text-slate-400 hover:text-slate-200"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 pr-10 focus:outline-none focus:border-amber-500/70 transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
                      tabIndex={-1}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {authMode === 'signup' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 pr-10 focus:outline-none focus:border-amber-500/70 transition-colors"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200 text-xs"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg font-semibold text-xs tracking-wide text-slate-950 transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:brightness-110 active:scale-[0.99] disabled:opacity-50 mt-2"
                  style={{ background: themeAccent }}
                >
                  {loading && <SpinnerIcon />}
                  <span>
                    {authMode === 'signup'
                      ? 'Register Firebase Account (Worker)'
                      : `Authenticate (${activeRoleMeta.label})`}
                  </span>
                </button>
              </form>
            )
          )}

          {/* ----------------- AUTH FLOW B: MOBILE PHONE & REAL SMS OTP ----------------- */}
          {authMode === 'signin' && signInMethod === 'mobile' && (
            <div className="space-y-4">
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                      Mobile Phone Number
                    </label>
                    <div className="flex rounded-lg bg-slate-900/90 border border-slate-700 overflow-hidden focus-within:border-amber-500/70 transition-colors">
                      <div className="px-3 py-2.5 bg-slate-800 text-slate-300 font-mono text-xs border-r border-slate-700 flex items-center gap-1">
                        <span>🇮🇳</span>
                        <span>+91</span>
                      </div>
                      <input
                        type="tel"
                        maxLength={10}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="98765 43210"
                        className="w-full px-3 py-2.5 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-mono"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || phone.length !== 10}
                    className="w-full py-2.5 rounded-lg font-semibold text-xs tracking-wide text-slate-950 transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
                    style={{ background: themeAccent }}
                  >
                    {loading && <SpinnerIcon />}
                    <span>Send SMS Verification Code</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-slate-300">
                      Code sent to <span className="font-mono font-semibold text-slate-100">+91 {phone}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false);
                        setOtp(['', '', '', '', '', '']);
                        clearAlerts();
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                    >
                      Change
                    </button>
                  </div>

                  {/* 6-box OTP Input */}
                  <div className="flex justify-between gap-2" onPaste={handleOtpPaste}>
                    {otp.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => (otpInputRefs.current[idx] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        className="w-12 h-12 text-center text-base font-bold font-mono rounded-lg bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-current focus:ring-1 focus:ring-current transition-all"
                        style={{ borderColor: digit ? themeAccent : undefined, color: themeAccent }}
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[11px] px-1">
                    {canResend ? (
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        className="text-amber-400 hover:underline font-medium"
                      >
                        Resend SMS OTP
                      </button>
                    ) : (
                      <span className="text-slate-500 font-mono">
                        Resend code in {countdown}s
                      </span>
                    )}
                    <span className="text-slate-500">Auto-expires in 5m</span>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otp.join('').length !== 6}
                    className="w-full py-2.5 rounded-lg font-semibold text-xs tracking-wide text-slate-950 transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
                    style={{ background: themeAccent }}
                  >
                    {loading && <SpinnerIcon />}
                    <span>Verify SMS Code & Enter Portal</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Divider and Google SSO */}
          {!(authMode === 'signup' && isElevatedRole(role)) && (
            <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[10.5px] uppercase">
                  <span className="bg-[#141920] px-2.5 text-slate-500 font-medium">Or continue with</span>
                </div>
              </div>

              {/* ----------------- AUTH FLOW C: GOOGLE OAUTH POPUP ----------------- */}
              <button
                type="button"
                onClick={handleGoogleSSO}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-700 text-xs font-medium text-slate-200 transition-all flex items-center justify-center gap-2.5 hover:border-slate-600 active:scale-[0.99]"
              >
                <GoogleLogoIcon />
                <span>Continue with Google Account</span>
              </button>
            </>
          )}
        </div>

        {/* Regulatory Footprint Badge */}
        <div className="mt-5 flex items-center justify-center gap-1.5 text-[10.5px] text-slate-500 font-mono tracking-tight">
          <ShieldCheckIcon size={13} />
          <span>DGMS (Tech) S&T / OISD-STD-114 Security Protocol</span>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-100">Reset Plant Access Password</h3>
              <button
                type="button"
                onClick={() => {
                  setShowForgotModal(false);
                  setForgotSubmitted(false);
                }}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            </div>

            {!forgotSubmitted ? (
              <form onSubmit={handleForgotSubmit} className="space-y-3">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enter your registered refinery email. Firebase will dispatch an official password reset authorization link.
                </p>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="operator@refinery.com"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  required
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 transition-colors"
                  >
                    {loading ? 'Sending...' : 'Send Reset Instructions'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="py-2 text-center space-y-2">
                <div className="text-emerald-400 text-base">✓</div>
                <div className="text-xs font-semibold text-slate-100">Reset Link Dispatched</div>
                <p className="text-[11px] text-slate-400">
                  Please check your inbox for the official Firebase password reset email.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(false);
                    setForgotSubmitted(false);
                  }}
                  className="mt-2 w-full py-2 rounded-lg text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400"
                >
                  Return to Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ICONS
// =============================================================================

function GoogleLogoIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.27 21.36 7.35 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.27 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

function DosimeterBadgeIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="7" width="16" height="11" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <rect x="9" y="11" width="6" height="4" rx="0.5" />
    </svg>
  );
}

function ShieldCheckIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 text-current" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
