import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// The colors from your Logo's prismatic shadow layer
export type AccentColor = 'fuchsia' | 'teal' | 'amber';

interface ThemeContextType {
  accentColor: AccentColor;
  randomizeAccent: () => void;
  getAccentClasses: (type: 'text' | 'bg' | 'lightBg' | 'border' | 'borderLight' | 'ring' | 'shadow' | 'hoverLight' | 'indicator') => string;
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
  const getAccentClasses = (type: 'text' | 'bg' | 'lightBg' | 'border' | 'borderLight' | 'ring' | 'shadow' | 'hoverLight' | 'indicator') => {
    const map = {
      fuchsia: {
        text: 'text-fuchsia-600 dark:text-fuchsia-400',
        bg: 'bg-fuchsia-600 hover:bg-fuchsia-700 text-white',
        lightBg: 'bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-400',
        border: 'border-fuchsia-500',
        borderLight: 'border-fuchsia-200 dark:border-fuchsia-800/30',
        ring: 'focus:ring-fuchsia-500',
        shadow: 'shadow-fuchsia-200 dark:shadow-none',
        hoverLight: 'hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/30 hover:text-fuchsia-600 dark:hover:text-fuchsia-400',
        indicator: 'bg-fuchsia-600 dark:bg-fuchsia-400'
      },
      teal: {
        text: 'text-teal-600 dark:text-teal-400',
        bg: 'bg-teal-600 hover:bg-teal-700 text-white',
        lightBg: 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
        border: 'border-teal-500',
        borderLight: 'border-teal-200 dark:border-teal-800/30',
        ring: 'focus:ring-teal-500',
        shadow: 'shadow-teal-200 dark:shadow-none',
        hoverLight: 'hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-600 dark:hover:text-teal-400',
        indicator: 'bg-teal-600 dark:bg-teal-400'
      },
      amber: {
        text: 'text-amber-600 dark:text-yellow-300',
        bg: 'bg-amber-500 hover:bg-amber-600 text-black dark:bg-yellow-400 dark:hover:bg-yellow-500',
        lightBg: 'bg-amber-50 dark:bg-yellow-400/20 text-amber-600 dark:text-yellow-300',
        border: 'border-amber-500 dark:border-yellow-400',
        borderLight: 'border-amber-200 dark:border-yellow-800/30',
        ring: 'focus:ring-amber-500 dark:focus:ring-yellow-400',
        shadow: 'shadow-amber-200 dark:shadow-none',
        hoverLight: 'hover:bg-amber-50 dark:hover:bg-yellow-400/30 hover:text-amber-600 dark:hover:text-yellow-300',
        indicator: 'bg-amber-500 dark:bg-yellow-400'
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
