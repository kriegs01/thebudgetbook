import React, { useState } from 'react';
import { X, Eye, EyeOff, Key } from 'lucide-react';
import { usePinProtection } from '../../hooks/usePinProtection';

interface SetPinModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SetPinModal: React.FC<SetPinModalProps> = ({ show, onClose, onSuccess }) => {
  const { setPin } = usePinProtection();
  const [pin, setLocalPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');

  if (!show) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (step === 'enter') {
      // Validate PIN format
      if (!pin || pin.length < 4 || pin.length > 6) {
        setError('PIN must be 4-6 digits');
        return;
      }
      if (!/^\d+$/.test(pin)) {
        setError('PIN must contain only numbers');
        return;
      }
      setStep('confirm');
    } else {
      // Confirm PIN
      if (pin !== confirmPin) {
        setError('PINs do not match');
        setConfirmPin('');
        return;
      }

      if (await setPin(pin)) {
        onSuccess();
        handleClose();
      } else {
        setError('Failed to set PIN. Please try again.');
      }
    }
  };

  const handleClose = () => {
    setLocalPin('');
    setConfirmPin('');
    setShowPin(false);
    setError('');
    setStep('enter');
    onClose();
  };

  const handleBack = () => {
    setConfirmPin('');
    setError('');
    setStep('enter');
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 flex flex-col transition-colors border border-transparent dark:border-gray-800">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center transition-colors">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight transition-colors">
                {step === 'enter' ? 'Create Your PIN' : 'Confirm Your PIN'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium transition-colors">
                {step === 'enter' ? 'Enter a 4-6 digit PIN' : 'Re-enter your PIN'}
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

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === 'enter' ? (
            <div>
              <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-2 transition-colors">
                Enter PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 6) {
                      setLocalPin(value);
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center font-medium transition-colors">
                {pin.length}/6 digits
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-2 transition-colors">
                Confirm PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={confirmPin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 6) {
                      setConfirmPin(value);
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
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl p-4 transition-colors">
              <p className="text-xs text-red-600 dark:text-red-400 font-bold text-center transition-colors">{error}</p>
            </div>
          )}

          <div className="flex flex-col space-y-3">
            {step === 'confirm' && (
              <button
                type="button"
                onClick={handleBack}
                className="w-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Back
              </button>
            )}
            <button
              type="submit"
              disabled={step === 'enter' ? pin.length < 4 : confirmPin.length < 4}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {step === 'enter' ? 'Continue' : 'Set PIN'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
