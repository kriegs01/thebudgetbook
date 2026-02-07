import React, { useState } from 'react';
import { Shield, CheckCircle, XCircle, AlertTriangle, Key } from 'lucide-react';
import { usePinProtection } from '../../hooks/usePinProtection';
import { SetPinModal } from '../modals/SetPinModal';
import { ChangePinModal } from '../modals/ChangePinModal';
import { VerifyPinModal } from '../modals/VerifyPinModal';

export const SecuritySettings: React.FC = () => {
  const {
    isPinEnabled,
    isPinSet,
    getProtectedFeatures,
    setProtectedFeatures,
    togglePinProtection,
    getSettings,
    updateSettings,
    getLastChangedDate,
    removePin,
  } = usePinProtection();

  const [showSetPinModal, setShowSetPinModal] = useState(false);
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [showRemovePinModal, setShowRemovePinModal] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [verifiedForRemoval, setVerifiedForRemoval] = useState(false);

  const settings = getSettings();
  const protectedFeatures = getProtectedFeatures();
  const lastChanged = getLastChangedDate();

  const featureOptions = [
    { id: 'danger_zone', label: 'Danger Zone (Reset All Data)', defaultEnabled: true },
    { id: 'test_environment', label: 'Test Environment Operations', defaultEnabled: true },
    { id: 'account_deletions', label: 'Account Deletions', defaultEnabled: false },
    { id: 'transaction_deletions', label: 'Transaction Deletions', defaultEnabled: false },
    { id: 'budget_modifications', label: 'Budget Modifications', defaultEnabled: false },
  ];

  const handleToggleFeature = (featureId: string) => {
    if (!isPinEnabled()) return;

    const newFeatures = protectedFeatures.includes(featureId)
      ? protectedFeatures.filter(f => f !== featureId)
      : [...protectedFeatures, featureId];
    
    setProtectedFeatures(newFeatures);
  };

  const handleRemovePin = () => {
    setShowRemovePinModal(true);
  };

  const handleRemovePinVerified = () => {
    setVerifiedForRemoval(true);
    setConfirmRemove(true);
    setShowRemovePinModal(false);
  };

  const confirmRemovePin = async () => {
    if (verifiedForRemoval) {
      // PIN already verified, pass empty string to bypass internal check
      await removePin('');
      setConfirmRemove(false);
      setVerifiedForRemoval(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6 pt-2">
      {/* Information Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
        <div className="flex items-start space-x-3">
          <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-blue-900 mb-1">About PIN Protection</h4>
            <p className="text-xs text-blue-700 leading-relaxed">
              Secure sensitive features with a 4-6 digit PIN. Once enabled, selected features 
              will require PIN verification before execution. Your session stays unlocked for 
              your configured timeout period.
            </p>
          </div>
        </div>
      </div>

      {/* PIN Protection Card */}
      <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-black text-sm text-gray-900 uppercase mb-1">PIN Protection</h4>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-500 font-medium">Status:</span>
              {isPinSet() ? (
                <span className="flex items-center space-x-1 text-green-600 text-xs font-bold">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Set</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1 text-gray-400 text-xs font-bold">
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Not Set</span>
                </span>
              )}
            </div>
            {lastChanged && (
              <p className="text-[10px] text-gray-400 mt-1">
                Last changed: {formatDate(lastChanged)}
              </p>
            )}
          </div>
          {isPinSet() && (
            <button
              onClick={() => togglePinProtection(!isPinEnabled())}
              className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
                isPinEnabled() ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  isPinEnabled() ? 'translate-x-9' : 'translate-x-1'
                }`}
              />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {!isPinSet() ? (
            <button
              onClick={() => setShowSetPinModal(true)}
              className="flex items-center justify-center space-x-2 p-3 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-all"
            >
              <Key className="w-4 h-4" />
              <span>Set PIN</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowChangePinModal(true)}
                className="flex items-center justify-center space-x-2 p-3 bg-orange-600 text-white rounded-xl font-bold text-xs hover:bg-orange-700 transition-all"
              >
                <Key className="w-4 h-4" />
                <span>Change PIN</span>
              </button>
              <button
                onClick={handleRemovePin}
                className="flex items-center justify-center space-x-2 p-3 bg-red-600 text-white rounded-xl font-bold text-xs hover:bg-red-700 transition-all"
              >
                <XCircle className="w-4 h-4" />
                <span>Remove PIN</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Protected Features Card */}
      {isPinSet() && (
        <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200 space-y-4">
          <div>
            <h4 className="font-black text-sm text-gray-900 uppercase mb-1">Protected Features</h4>
            <p className="text-xs text-gray-500 font-medium">
              Select which features require PIN verification
            </p>
          </div>

          <div className="space-y-3">
            {featureOptions.map(feature => (
              <label
                key={feature.id}
                className={`flex items-center space-x-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  isPinEnabled()
                    ? protectedFeatures.includes(feature.id)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                    : 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                }`}
              >
                <input
                  type="checkbox"
                  checked={protectedFeatures.includes(feature.id)}
                  onChange={() => handleToggleFeature(feature.id)}
                  disabled={!isPinEnabled()}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <span className="text-xs font-bold text-gray-900">{feature.label}</span>
                  {feature.defaultEnabled && (
                    <span className="ml-2 text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                      RECOMMENDED
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>

          {!isPinEnabled() && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-xs text-orange-700 font-medium text-center">
                Enable PIN protection to configure protected features
              </p>
            </div>
          )}
        </div>
      )}

      {/* Advanced Settings Card */}
      {isPinSet() && isPinEnabled() && (
        <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200 space-y-4">
          <div>
            <h4 className="font-black text-sm text-gray-900 uppercase mb-1">Advanced Settings</h4>
            <p className="text-xs text-gray-500 font-medium">
              Configure security parameters
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                Session Timeout
              </label>
              <select
                value={settings.session_timeout}
                onChange={(e) => updateSettings({ session_timeout: parseInt(e.target.value) })}
                className="w-full bg-white border-gray-200 rounded-xl p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="1">1 minute</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                Max Failed Attempts
              </label>
              <select
                value={settings.max_attempts}
                onChange={(e) => updateSettings({ max_attempts: parseInt(e.target.value) })}
                className="w-full bg-white border-gray-200 rounded-xl p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="3">3 attempts</option>
                <option value="5">5 attempts</option>
                <option value="10">10 attempts</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
                Lockout Duration
              </label>
              <select
                value={settings.lockout_duration}
                onChange={(e) => updateSettings({ lockout_duration: parseInt(e.target.value) })}
                className="w-full bg-white border-gray-200 rounded-xl p-3 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="1">1 minute</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="30">30 minutes</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <SetPinModal
        show={showSetPinModal}
        onClose={() => setShowSetPinModal(false)}
        onSuccess={() => {
          setShowSetPinModal(false);
        }}
      />

      <ChangePinModal
        show={showChangePinModal}
        onClose={() => setShowChangePinModal(false)}
        onSuccess={() => {
          setShowChangePinModal(false);
        }}
      />

      <VerifyPinModal
        show={showRemovePinModal}
        onClose={() => setShowRemovePinModal(false)}
        onVerified={handleRemovePinVerified}
        actionLabel="Remove PIN Protection"
      />

      {/* Confirm Remove Dialog */}
      {confirmRemove && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-10 shadow-2xl animate-in zoom-in-95 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">
              Remove PIN Protection?
            </h3>
            <p className="text-sm text-gray-500 mb-8 font-medium leading-relaxed">
              This will disable PIN protection and remove all security settings. 
              Protected features will be accessible without verification.
            </p>
            <div className="flex flex-col w-full space-y-3">
              <button
                onClick={() => {
                  confirmRemovePin();
                }}
                className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-all shadow-lg shadow-red-100"
              >
                Remove PIN
              </button>
              <button
                onClick={() => {
                  setConfirmRemove(false);
                  setVerifiedForRemoval(false);
                }}
                className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
