import React, { useState } from 'react';
import { Lock, Mail, AlertCircle, Loader, ArrowLeft } from 'lucide-react';
import { useAuth } from '../src/contexts/AuthContext';
import { Logo } from '../src/components/Logo'; // Import the logo

const AuthInput = ({ id, type, value, onChange, placeholder, icon: Icon, disabled }: any) => (
  <div className="relative">
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-4 py-3 text-gray-800 bg-gray-100 border-2 border-gray-900 rounded-lg shadow-[3px_3px_0px_#000] focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all"
    />
    {Icon && <Icon className="absolute top-1/2 right-4 -translate-y-1/2 w-5 h-5 text-gray-500" />}
  </div>
);

const Auth: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { signIn, signUp, resetPassword } = useAuth();

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
        if (error) {
          setError(error.message || 'Failed to send reset email.');
        } else {
          setSuccess('Password reset link sent! Check your inbox.');
          setEmail('');
        }
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!validatePassword(password)) {
      return setError('Password must be at least 6 characters long');
    }

    if (mode === 'signup') {
      if (!firstName.trim() || !lastName.trim()) {
        return setError('Please enter your first and last name');
      }
      if (password !== confirmPassword) {
        return setError('Passwords do not match');
      }
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) setError(error.message || 'Failed to sign in.');
      } else {
        const { error } = await signUp(email, password, firstName, lastName);
        if (error) {
          setError(error.message || 'Failed to sign up.');
        } else {
          setSuccess('Account created! Check your email to verify.');
          setEmail('');
          setPassword('');
          setConfirmPassword('');
          setFirstName('');
          setLastName('');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FCF6E8] font-sans flex items-center justify-center p-4">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Titan+One&display=swap');
        .font-titan { font-family: 'Titan One', cursive; }
      `}</style>
      
      <div className="max-w-sm w-full">
        {/* Updated Logo Section */}
        <div className="mb-8 flex flex-col items-center justify-center">
            <div className="flex items-center justify-center">
                <img src="/iconapp.png" alt="Budee Mascot" className="h-20 w-20 drop-shadow-lg transform rotate-[15deg] -mr-4 z-10" />
                <Logo className="text-6xl" />
            </div>
          <p className="text-gray-600 mt-4">
            {mode === 'login' ? 'Welcome back, bud!' : mode === 'signup' ? "Let's get you started!" : "No worries, we'll fix it!"}
          </p>
        </div>

        <div className="bg-white border-[3px] border-black rounded-2xl shadow-[8px_8px_0px_#000] p-8">
          {mode === 'reset' && (
            <button onClick={() => setMode('login')} className="text-sm text-[#4A90E2] hover:underline mb-4 flex items-center">
              <ArrowLeft size={16} className="mr-1" /> Back to Login
            </button>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-100 border-2 border-red-500 rounded-lg flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
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
              <div className="grid grid-cols-2 gap-4">
                <AuthInput id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First Name" disabled={loading} />
                <AuthInput id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last Name" disabled={loading} />
              </div>
            )}
            
            <AuthInput id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" icon={Mail} disabled={loading} />

            {mode !== 'reset' && (
              <>
                <AuthInput id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" icon={Lock} disabled={loading} />
                {mode === 'signup' && (
                  <AuthInput id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm Password" icon={Lock} disabled={loading} />
                )}
              </>
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
                <>{mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}</>
              )}
            </button>
          </form>

          {mode === 'login' && (
            <p className="text-center text-sm mt-6">
              No account? <button onClick={() => setMode('signup')} className="text-[#FF6B6B] font-bold hover:underline">Sign up!</button>
              <span className="mx-2">·</span>
              <button onClick={() => setMode('reset')} className="text-gray-500 hover:underline">Forgot password?</button>
            </p>
          )}
           {mode === 'signup' && (
            <p className="text-center text-sm mt-6">
              Already have an account? <button onClick={() => setMode('login')} className="text-[#4A90E2] font-bold hover:underline">Log in!</button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
