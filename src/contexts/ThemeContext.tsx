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
      // Helper to dynamically get Tailwind classes for the current accent
  const getAccentClasses = (type: 'bg' | 'text' | 'border' | 'lightBg' = 'bg') => {
    switch (type) {
      case 'bg':
        // The main solid color (retro amber background with stark black text for high contrast)
        return 'bg-amber-500 text-black border-black';
      case 'text':
        // For highlighted text or icons
        return 'text-amber-600 dark:text-amber-400';
      case 'border':
        // For colored outlines
        return 'border-amber-500';
      case 'lightBg':
        // For subtle notification badges or soft backgrounds
        return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300';
      default:
        return 'bg-amber-500 text-black';
    }
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