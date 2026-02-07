import React, { useState } from 'react';
import { X, Eye, EyeOff, Key } from 'lucide-react';
import { usePinProtection } from '../../hooks/usePinProtection';

interface ChangePinModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ChangePinModal: React.FC<ChangePinModalProps> = ({ show, onClose, onSuccess }) => {
  const { changePin } = usePinProtection();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');

  if (!show) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (step === 'current') {
      if (!currentPin || currentPin.length < 4) {
        setError('Please enter your current PIN');
        return;
      }
      setStep('new');
    } else if (step === 'new') {
      // Validate new PIN format
      if (!newPin || newPin.length < 4 || newPin.length > 6) {
        setError('PIN must be 4-6 digits');
        return;
      }
      if (!/^\d+$/.test(newPin)) {
        setError('PIN must contain only numbers');
        return;
      }
      if (newPin === currentPin) {
        setError('New PIN must be different from current PIN');
        return;
      }
      setStep('confirm');
    } else {
      // Confirm new PIN
      if (newPin !== confirmNewPin) {
        setError('PINs do not match');
        setConfirmNewPin('');
        return;
      }

      if (changePin(currentPin, newPin)) {
        onSuccess();
        handleClose();
      } else {
        setError('Current PIN is incorrect');
        setStep('current');
        setCurrentPin('');
      }
    }
  };

  const handleClose = () => {
    setCurrentPin('');
    setNewPin('');
    setConfirmNewPin('');
    setShowPin(false);
    setError('');
    setStep('current');
    onClose();
  };

  const handleBack = () => {
    setError('');
    if (step === 'new') {
      setNewPin('');
      setStep('current');
    } else if (step === 'confirm') {
      setConfirmNewPin('');
      setStep('new');
    }
  };

  const getTitle = () => {
    if (step === 'current') return 'Enter Current PIN';
    if (step === 'new') return 'Enter New PIN';
    return 'Confirm New PIN';
  };

  const getSubtitle = () => {
    if (step === 'current') return 'Verify your identity';
    if (step === 'new') return 'Choose a new 4-6 digit PIN';
    return 'Re-enter your new PIN';
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-[2.5rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in-95 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                {getTitle()}
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                {getSubtitle()}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === 'current' && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                Current PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={currentPin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 6) {
                      setCurrentPin(value);
                      setError('');
                    }
                  }}
                  placeholder="••••"
                  maxLength={6}
                  autoFocus
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 text-2xl text-center font-bold tracking-widest outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {step === 'new' && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                New PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={newPin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 6) {
                      setNewPin(value);
                      setError('');
                    }
                  }}
                  placeholder="••••"
                  maxLength={6}
                  autoFocus
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 text-2xl text-center font-bold tracking-widest outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center font-medium">
                {newPin.length}/6 digits
              </p>
            </div>
          )}

          {step === 'confirm' && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                Confirm New PIN
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={confirmNewPin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 6) {
                      setConfirmNewPin(value);
                      setError('');
                    }
                  }}
                  placeholder="••••"
                  maxLength={6}
                  autoFocus
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 text-2xl text-center font-bold tracking-widest outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 animate-in shake">
              <p className="text-xs text-red-600 font-bold text-center">{error}</p>
            </div>
          )}

          <div className="flex flex-col space-y-3">
            {step !== 'current' && (
              <button
                type="button"
                onClick={handleBack}
                className="w-full bg-gray-100 text-gray-600 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all"
              >
                Back
              </button>
            )}
            <button
              type="submit"
              disabled={
                (step === 'current' && currentPin.length < 4) ||
                (step === 'new' && newPin.length < 4) ||
                (step === 'confirm' && confirmNewPin.length < 4)
              }
              className="w-full bg-orange-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-orange-700 transition-all shadow-lg shadow-orange-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {step === 'confirm' ? 'Change PIN' : 'Continue'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
