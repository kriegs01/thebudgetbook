
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../src/utils/supabaseClient';
import { useAuth } from '../src/contexts/AuthContext'; // Import useAuth to listen for the user session
import { Loader, AlertCircle } from 'lucide-react';

const AuthConfirm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth(); // Get the user from the central auth context
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // Effect 1: This runs ONLY when the `user` object from the context is populated.
  // This is how we solve the race condition.
  useEffect(() => {
    // If the user object exists, the AuthProvider has acknowledged the new session.
    // It is now safe to navigate to the protected part of the app.
    if (user) {
      const next = searchParams.get('next') || '/';
      navigate(next);
    }
  }, [user, navigate, searchParams]);

  // Effect 2: This runs only ONCE on component mount to verify the token.
  useEffect(() => {
    let isMounted = true;

    const verifyToken = async () => {
      const token_hash = searchParams.get('token_hash');
      const type = searchParams.get('type');

      if (!token_hash || !type) {
        setError('Invalid confirmation link. Missing required parameters.');
        setInitialLoading(false);
        return;
      }
      
      const { error: verificationError } = await supabase.auth.verifyOtp({
        token_hash,
        type: type as any,
      });

      // If there's an error and the component is still mounted, show the error.
      if (verificationError && isMounted) {
        console.error("OTP Verification Error:", verificationError);
        setError('The password reset link is invalid or has expired. Please try again.');
        setInitialLoading(false);
        setTimeout(() => navigate('/auth/auth-code-error'), 4000);
        return;
      }

      // On success, we DON'T navigate. We simply stop the initial loader.
      // The onAuthStateChange event will fire, updating the `AuthContext`,
      // which will populate the `user` object and trigger the first useEffect.
      if (isMounted) {
          setInitialLoading(false);
      }
    };

    verifyToken();

    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // A derived state to show a loader while we wait for the session to be confirmed by the app
  const showWaitingForSession = !initialLoading && !error && !user;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center p-4">
      {(initialLoading || showWaitingForSession) && (
        <>
          <Loader className="w-12 h-12 text-blue-600 animate-spin mb-4" />
          <h1 className="text-2xl font-semibold text-gray-800">
            {initialLoading ? 'Verifying your request...' : 'Finalizing sign-in...'}
          </h1>
          <p className="text-gray-600 mt-2">Please wait while we securely process your request.</p>
        </>
      )}

      {error && (
        <>
          <AlertCircle className="w-12 h-12 text-red-600 mb-4" />
          <h1 className="text-2xl font-semibold text-red-800">Verification Failed</h1>
          <p className="text-gray-600 mt-2">{error}</p>
        </>
      )}
    </div>
  );
};

export default AuthConfirm;
