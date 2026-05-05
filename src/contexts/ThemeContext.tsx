import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// The colors from your Logo's prismatic shadow layer
export type AccentColor = 'fuchsia' | 'teal' | 'amber';

interface ThemeContextType {
  accentColor: AccentColor;
  randomizeAccent: () => void;
  getAccentClasses: (type: 'text' | 'bg' | 'lightBg' | 'border' | 'ring') => string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [accentColor, setAccentColor] = useState<AccentColor>('fuchsia');

  const randomizeAccent = () => {
    const colors: AccentColor[] = ['fuchsia', 'teal', 'amber'];
    setAccentColor(prev => {
      // Ensure we get a different color each time
      const available = colors.filter(c => c !== prev);
      return available[Math.floor(Math.random() * available.length)];
    });
  };

  // Automatically randomize color when clicking buttons or links globally
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('a')) {
        randomizeAccent();
      }
    };

    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  // Helper to dynamically get Tailwind classes for the current accent
  const getAccentClasses = (type: 'text' | 'bg' | 'lightBg' | 'border' | 'ring') => {
    const map = {
      fuchsia: {
        text: 'text-fuchsia-500 dark:text-fuchsia-400',
        bg: 'bg-fuchsia-500 hover:bg-fuchsia-600 text-white',
        lightBg: 'bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-400',
        border: 'border-fuchsia-500',
        ring: 'focus:ring-fuchsia-500'
      },
      teal: {
        text: 'text-teal-500 dark:text-teal-400',
        bg: 'bg-teal-500 hover:bg-teal-600 text-white',
        lightBg: 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
        border: 'border-teal-500',
        ring: 'focus:ring-teal-500'
      },
      amber: {
        text: 'text-amber-500 dark:text-amber-400',
        bg: 'bg-amber-500 hover:bg-amber-600 text-white',
        lightBg: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
        border: 'border-amber-500',
        ring: 'focus:ring-amber-500'
      }
    };
    return map[accentColor][type];
  };

  return (
    <ThemeContext.Provider value={{ accentColor, randomizeAccent, getAccentClasses }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};