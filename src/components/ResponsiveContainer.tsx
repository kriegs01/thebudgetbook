import React from 'react';
import useMediaQuery from '../hooks/useMediaQuery';

interface ResponsiveContainerProps {
  desktop: React.ReactNode;
  mobile: React.ReactNode;
}

const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({ desktop, mobile }) => {
  // Use a common breakpoint for mobile devices (e.g., 768px)
  const isMobile = useMediaQuery('(max-width: 768px)');

  return <>{isMobile ? mobile : desktop}</>;
};

export default ResponsiveContainer;
