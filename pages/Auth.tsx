import React, { useEffect, useState } from 'react';
import { Lock, Mail, AlertCircle, Loader, ArrowLeft } from 'lucide-react';
import { useAuth } from '../src/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../src/components/Logo';
import { supabase } from '../src/utils/supabaseClient'; // Make sure supabase is imported for the RPC call!

const PasswordShapes = ({ password, selectionStart = 0, selectionEnd = 0 }: any) => {
  const colors = ['#4ECDC4', '#FF6B6B', '#FBBF24'];
  const shapes = [
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2"/>
    </svg>,
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 2L1 14H15L8 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>,
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ];

  return (
    <div className="flex items-center" aria-hidden="true">
      {password.split('').map((_: any, index: number) => {
        const isSelected = index >= selectionStart && index < selectionEnd;
        const Shape = React.cloneElement(shapes[index % shapes.length], { key: index });
        
        return (
          <span 
            key={index} 
            className={`px-[2px] py-1 ${isSelected ? 'bg-[#b4d5fe] dark:bg-blue-500/50' : ''}`} 
            style={{ color: colors[index % colors.length] }}
          >
            {Shape}
          </span>
        );
      })}
    </div>
  );
};

const AuthInput = ({ id, type, value, onChange, placeholder, icon: Icon, disabled }: any) => {
  const isPasswordFilled = type === 'password' && value;
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  const handleSelect = (e: any) => {
    if (type === 'password') {
      try {
        setSelection({
          start: e.target.selectionStart || 0,
          end: e.target.selectionEnd || 0
        });
      } catch (err) { }
    }
  };

  return (
    <div 
      className={`relative flex items-center w-full border-2 border-gray-900 rounded-lg shadow-[3px_3px_0px_#000] transition-all focus-within:ring-2 focus-within:ring-yellow-400 focus-within:bg-white dark:focus-within:bg-gray-800 ${
        value ? 'bg-white dark:bg-gray-800' : 'bg-gray-100 dark:bg-gray-900'
      }`}
    >
      {isPasswordFilled && (
        <div className="absolute left-[14px] right-12 flex items-center overflow-hidden pointer-events-none z-10">
          <PasswordShapes password={value} selectionStart={selection.start} selectionEnd={selection.end} />
        </div>
      )}

      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => {
          onChange(e);
          handleSelect(e);
        }}
        onSelect={handleSelect}
        onKeyUp={handleSelect}
        onMouseUp={handleSelect}
        onMouseLeave={handleSelect}
        onBlur={() => setSelection({ start: 0, end: 0 })}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-4 py-3 bg-transparent focus:outline-none z-20 dark:text-white ${
          isPasswordFilled ? 'opacity-0' : 'text-gray-800'
        }`}
      />

      {Icon && (
        <Icon className="absolute right-4 w-5 h-5 text-gray-500 pointer-events-none z-10" />
      )}
    </div>
  );
};

const Auth: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [loginStep, setLoginStep] = useState<1 | 2>(1); // 🟢 2-Step Tracker
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const navigate = useNavigate();
  const { signIn, signUp, resetPassword, user, loading: authLoading, isPasswordRecovery } = useAuth();

  useEffect(() => {
    if (!authLoading && user) {
      navigate(isPasswordRecovery ? '/update-password' : '/', { replace: true });
    }
  }, [authLoading, user, isPasswordRecovery, navigate]);

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = (password: string) => password.length >= 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validateEmail(email)) {
      return setError('Please enter a valid email address');
    }

    if (mode === 'reset') {
      setLoading(true);
      try {
        const { error } = await resetPassword(email);
        if (error) setError(error.message || 'Failed to send reset email.');
        else { setSuccess('Password reset link sent! Check your inbox.'); setEmail(''); }
      } catch (err: any) { setError(err.message || 'An unexpected error occurred');
      } finally { setLoading(false); }
      return;
    }

    // 🟢 LOGIN STEP 1: Verify Email & Fetch Theme
    if (mode === 'login' && loginStep === 1) {
      setLoading(true);
      try {
        const { data: theme } = await supabase.rpc('get_user_theme_by_email', { check_email: email.toLowerCase().trim() });
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
        } else {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('theme', 'light');
        }
        setLoginStep(2);
      } catch (err) {
        console.error('Failed to fetch theme', err);
        setLoginStep(2); // Advance even if it fails
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!validatePassword(password)) {
      return setError('Password must be at least 6 characters long');
    }

    if (mode === 'signup') {
      if (!firstName.trim() || !lastName.trim()) return setError('Please enter your first and last name');
      if (password !== confirmPassword) return setError('Passwords do not match');
    }

    setLoading(true);

    try {
      // 🟢 LOGIN STEP 2: Final Auth Submission
      if (mode === 'login' && loginStep === 2) {
        const { error } = await signIn(email, password);
        if (error) setError(error.message || 'Failed to sign in.');
      } else {
        const { error } = await signUp(email, password, firstName, lastName);
        if (error) setError(error.message || 'Failed to sign up.');
        else {
          setSuccess('Account created! Check your email to verify.');
          setEmail(''); setPassword(''); setConfirmPassword(''); setFirstName(''); setLastName('');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

    const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // The trailing slash ensures it matches the wildcard (/*) in Supabase
          redirectTo: `${window.location.origin}/`, 
        }
      });
      if (error) setError(error.message || 'Failed to initialize Google Sign-In.');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };


  
  // Reset steps when changing modes
  const handleModeChange = (newMode: 'login' | 'signup' | 'reset') => {
    setMode(newMode);
    setLoginStep(1);
    setError('');
    setSuccess('');
  };

  return (
    <div className="min-h-screen bg-[#FCF6E8] dark:bg-gray-950 font-sans flex items-center justify-center p-4 transition-colors duration-500">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Titan+One&display=swap');
        .font-titan { font-family: 'Titan One', cursive; }
      `}</style>
      
      <div className="max-w-sm w-full">
        <div className="mb-8 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
          <div className="flex items-center justify-center">
            <img src="/iconapp.png" alt="Budee Mascot" className="h-24 w-24 drop-shadow-lg transform rotate-[15deg] -mr-5 z-10" />
            <Logo className="text-7xl dark:text-white transition-colors duration-500" />
          </div>
          <p className="font-titan text-xl text-gray-800 dark:text-gray-300 mt-4 tracking-wide transition-colors duration-500">
            {mode === 'login' ? (loginStep === 1 ? 'Welcome back, bud!' : 'Almost there...') : mode === 'signup' ? "Let's get you started!" : "Let’s get you back in!"}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 border-[3px] border-black rounded-2xl shadow-[8px_8px_0px_#000] p-8 transition-colors duration-500">
          {mode === 'reset' && (
            <button onClick={() => handleModeChange('login')} className="text-sm text-[#4A90E2] hover:underline mb-4 flex items-center">
              <ArrowLeft size={16} className="mr-1" /> Back to Login
            </button>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-100 border-2 border-red-500 rounded-lg flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2 shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-100 border-2 border-green-500 rounded-lg">
              <p className="text-sm text-green-800">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {mode === 'signup' && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                <AuthInput id="firstName" type="text" value={firstName} onChange={(e: any) => setFirstName(e.target.value)} placeholder="First Name" disabled={loading} />
                <AuthInput id="lastName" type="text" value={lastName} onChange={(e: any) => setLastName(e.target.value)} placeholder="Last Name" disabled={loading} />
              </div>
            )}
            
            {/* 🟢 STEP 2 LOGIN PILL */}
            {mode === 'login' && loginStep === 2 && (
              <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 border-2 border-black rounded-xl p-3 shadow-[3px_3px_0px_#000] animate-in fade-in slide-in-from-right-4">
                <span className="font-bold text-sm text-gray-900 dark:text-white truncate pr-2">{email}</span>
                <button 
                  type="button" 
                  onClick={() => setLoginStep(1)}
                  className="shrink-0 text-xs font-black uppercase tracking-widest text-[#4ECDC4] hover:underline"
                >
                  Edit
                </button>
              </div>
            )}

            {/* Email Input (Hides on Step 2 of Login) */}
            {(mode !== 'login' || loginStep === 1) && (
              <div className="animate-in fade-in slide-in-from-left-4">
                <AuthInput id="email" type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="Email Address" icon={Mail} disabled={loading} />
              </div>
            )}

            {/* Password Inputs (Hides on Step 1 of Login and Reset Mode) */}
            {(mode !== 'reset' && (mode !== 'login' || loginStep === 2)) && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                <AuthInput id="password" type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} placeholder="Password" icon={Lock} disabled={loading} />
                {mode === 'signup' && (
                  <AuthInput id="confirmPassword" type="password" value={confirmPassword} onChange={(e: any) => setConfirmPassword(e.target.value)} placeholder="Confirm Password" icon={Lock} disabled={loading} />
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full text-white py-3 rounded-lg font-bold shadow-[4px_4px_0px_#000] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-lg ${loading ? 'bg-gray-400' : 'bg-[#4ECDC4] hover:bg-[#45B7D1] active:shadow-none active:translate-x-1 active:translate-y-1'}`}
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 mr-2 animate-spin" />
                  Please wait...
                </>
              ) : (
                <>{mode === 'login' ? (loginStep === 1 ? 'Continue' : 'Sign In') : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}</>
              )}
            </button>
          </form>

                    {/* 🟢 GOOGLE SIGN IN BUTTON (Hidden on Reset or Login Step 2) */}
          {(mode === 'signup' || (mode === 'login' && loginStep === 1)) && (
            <div className="mt-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="relative flex items-center justify-center mb-6">
                <div className="border-t-[3px] border-gray-200 dark:border-gray-800 w-full"></div>
                <span className="bg-white dark:bg-gray-900 px-4 text-xs font-black text-gray-400 uppercase tracking-widest absolute transition-colors duration-500">Or</span>
              </div>
              
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-[3px] border-black rounded-xl p-4 font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all disabled:opacity-50"
              >
                {/* Custom SVG for the classic Google 'G' Logo */}
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </div>
          )}


          {mode === 'login' && loginStep === 1 && (
            <p className="text-center text-sm mt-6 dark:text-gray-400">
              No account? <button onClick={() => handleModeChange('signup')} className="text-[#FF6B6B] font-bold hover:underline">Sign up!</button>
              <span className="mx-2">·</span>
              <button onClick={() => handleModeChange('reset')} className="text-gray-500 hover:underline">Forgot password?</button>
            </p>
          )}
          {mode === 'signup' && (
            <p className="text-center text-sm mt-6 dark:text-gray-400">
              Already have an account? <button onClick={() => handleModeChange('login')} className="text-[#4A90E2] font-bold hover:underline">Log in!</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
