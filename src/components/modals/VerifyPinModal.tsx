import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Lock, AlertTriangle } from 'lucide-react';
import { usePinProtection } from '../../hooks/usePinProtection';

interface VerifyPinModalProps {
  show: boolean;
  onClose: () => void;
  onVerified: () => void;
  actionLabel?: string;
}

export const VerifyPinModal: React.FC<VerifyPinModalProps> = ({ 
  show, 
  onClose, 
  onVerified, 
  actionLabel = 'Protected Action' 
}) => {
  const { verifyPin, getRemainingAttempts, isLockedOut, getLockoutTimeRemaining, getSettings } = usePinProtection();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [lockoutTime, setLockoutTime] = useState(0);
  
  const settings = getSettings();

  useEffect(() => {
    if (isLockedOut()) {
      setLockoutTime(getLockoutTimeRemaining());
      const interval = setInterval(() => {
        const remaining = getLockoutTimeRemaining();
        setLockoutTime(remaining);
        if (remaining === 0) {
          clearInterval(interval);
          setError('');
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isLockedOut, getLockoutTimeRemaining]);

  if (!show) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isLockedOut()) {
      const minutes = Math.floor(lockoutTime / 60);
      const seconds = lockoutTime % 60;
      setError(`Locked out. Try again in ${minutes}:${seconds.toString().padStart(2, '0')}`);
      triggerShake();
      return;
    }

    if (!pin || pin.length < 4) {
      setError('Please enter your PIN');
      triggerShake();
      return;
    }

    if (await verifyPin(pin)) {
      onVerified();
      handleClose();
    } else {
      const remaining = getRemainingAttempts();
      if (remaining > 0) {
        setError(`Incorrect PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
      } else {
        setError('Too many failed attempts. Account locked.');
      }
      triggerShake();
      setPin('');
    }
  };

  const handleClose = () => {
    setPin('');
    setShowPin(false);
    setError('');
    setShake(false);
    onClose();
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  const formatLockoutTime = () => {
    const minutes = Math.floor(lockoutTime / 60);
    const seconds = lockoutTime % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
      onKeyDown={handleKeyDown}
    >
      <div className={`bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 flex flex-col transition-colors border border-transparent dark:border-gray-800 ${shake ? 'animate-shake' : ''}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className={`w-12 h-12 ${isLockedOut() ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'} rounded-2xl flex items-center justify-center transition-colors`}>
              {isLockedOut() ? <AlertTriangle className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight transition-colors">
                {isLockedOut() ? 'Account Locked' : 'Enter PIN'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium transition-colors">
                {isLockedOut() ? `Unlock in ${formatLockoutTime()}` : actionLabel}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </button>
        </div>

        {isLockedOut() ? (
          <div className="space-y-6">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-2xl p-6 text-center transition-colors">
              <AlertTriangle className="w-12 h-12 text-red-600 dark:text-red-400 mx-auto mb-4 transition-colors" />
              <p className="text-sm text-red-700 dark:text-red-400 font-bold mb-2 transition-colors">
                Too many failed attempts
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 transition-colors">
                Please wait {formatLockoutTime()} before trying again.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-2 transition-colors">
                PIN Code
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 6) {
                      setPin(value);
                      setError('');
                    }
                  }}
                  placeholder="••••"
                  maxLength={6}
                  autoFocus
                  className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-2xl p-4 text-2xl text-center font-bold tracking-widest outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl p-4 transition-colors">
                <p className="text-xs text-red-600 dark:text-red-400 font-bold text-center transition-colors">{error}</p>
              </div>
            )}

            {!isLockedOut() && getRemainingAttempts() < settings.max_attempts && !error && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 rounded-xl p-4 transition-colors">
                <p className="text-xs text-orange-600 dark:text-orange-400 font-bold text-center transition-colors">
                  ⚠️ {getRemainingAttempts()} attempt{getRemainingAttempts() === 1 ? '' : 's'} remaining
                </p>
              </div>
            )}

            <div className="flex flex-col space-y-3">
              <button
                type="submit"
                disabled={pin.length < 4}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Verify
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="w-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
          20%, 40%, 60%, 80% { transform: translateX(10px); }
        }
        .animate-shake {
          animation: shake 0.5s;
        }
      `}</style>
    </div>
  );
};
