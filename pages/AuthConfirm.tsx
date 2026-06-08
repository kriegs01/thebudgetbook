
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../src/utils/supabaseClient'; // Assuming this is your Supabase client path
import { Loader, AlertCircle } from 'lucide-react';

const AuthConfirm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token_hash = searchParams.get('token_hash');
    const type = searchParams.get('type');
    const next = searchParams.get('next') || '/';

    if (token_hash && type) {
      const verifyUserToken = async () => {
        setLoading(true);
        setError(null);
        
        const { data, error: verificationError } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as any, // Cast because Supabase expects a specific string literal type
        });

        if (verificationError || !data.session) {
          console.error("OTP Verification Error:", verificationError);
          setError('The password reset link is invalid or has expired. Please try again.');
          setLoading(false);
          // Optional: Redirect to an error page after a delay
          setTimeout(() => navigate('/auth/auth-code-error'), 4000);
          return;
        }

        // The token is valid, a session is created.
        // The AuthProvider will now see the new session and handle it.
        // We can now redirect to the intended page.
        navigate(next);
      };

      verifyUserToken();
    } else {
      setError('Invalid confirmation link. Missing required parameters.');
      setLoading(false);
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center p-4">
      {loading && (
        <>
          <Loader className="w-12 h-12 text-blue-600 animate-spin mb-4" />
          <h1 className="text-2xl font-semibold text-gray-800">Verifying your request...</h1>
          <p className="text-gray-600 mt-2">Please wait while we securely process your link.</p>
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
