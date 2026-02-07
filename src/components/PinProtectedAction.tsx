import React, { useState, ReactNode } from 'react';
import { usePinProtection } from '../hooks/usePinProtection';
import { VerifyPinModal } from './modals/VerifyPinModal';

interface PinProtectedActionProps {
  featureId: string;
  onVerified: () => void;
  actionLabel?: string;
  children: ReactNode;
}

export const PinProtectedAction: React.FC<PinProtectedActionProps> = ({
  featureId,
  onVerified,
  actionLabel,
  children,
}) => {
  const { isFeatureProtected, isSessionActive } = usePinProtection();
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if this feature requires PIN protection
    if (isFeatureProtected(featureId)) {
      // Check if session is already active
      if (isSessionActive()) {
        // Session is active, execute action immediately
        onVerified();
      } else {
        // Need to verify PIN
        setShowVerifyModal(true);
      }
    } else {
      // No PIN protection needed, execute action immediately
      onVerified();
    }
  };

  const handleVerified = () => {
    setShowVerifyModal(false);
    onVerified();
  };

  return (
    <>
      <div onClick={handleClick}>
        {children}
      </div>
      
      <VerifyPinModal
        show={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        onVerified={handleVerified}
        actionLabel={actionLabel}
      />
    </>
  );
};
