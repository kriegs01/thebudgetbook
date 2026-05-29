import React, { useRef, useState, useEffect } from 'react';
import useMediaQuery from '../hooks/useMediaQuery';
import { useTheme } from '../contexts/ThemeContext';

const PageHeader: React.FC<any> = ({ title, subtitle, icon, actions, backButton }) => {
  const { getAccentClasses } = useTheme();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const [highlightWidth, setHighlightWidth] = useState(0);

  useEffect(() => {
    if (titleContainerRef.current) {
      setHighlightWidth(titleContainerRef.current.offsetWidth);
    }
  }, [title, isMobile]);

  return (
    <header className={`${isMobile ? 'pt-16' : 'pt-12'} flex flex-row items-center justify-between gap-6 mb-4`}>
      <div className="flex flex-1 items-center gap-6">
        {backButton}
        <div className="flex-1">
          <div className="relative inline-block">
            <div ref={titleContainerRef} className="flex items-center gap-4">
              {icon && <div className="z-10 shrink-0">{icon}</div>}
              <h1 className={`font-titan text-[clamp(2rem,7.5vw,3.75rem)] uppercase tracking-tighter leading-none relative z-10 [text-shadow:-1px_-1px_0_#000,1px_-1px_0_#000,-1px_1px_0_#000,1px_1px_0_#000] drop-shadow-[3px_3px_0px_#000] ${icon ? getAccentClasses('text') : 'text-black dark:text-white'}`}>
                {title}
              </h1>
            </div>
            {highlightWidth > 0 && (
              <div
                className={`absolute bottom-0 left-0 h-4 ${getAccentClasses('bg')} opacity-40 -z-0 -rotate-1 -translate-x-2 transition-colors duration-300`}
                style={{ width: `${highlightWidth}px` }}
              />
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 ml-1">
            <p className="text-[clamp(1rem,3vw,1.25rem)] font-bold italic text-black/50 dark:text-gray-400 transition-colors duration-300">
              {subtitle}
            </p>
          </div>
          <div className={`h-2 w-32 mt-2 bg-black dark:bg-white/20 transition-colors duration-300`} />
        </div>
      </div>
      {actions && <div className="flex items-center justify-end gap-3">{actions}</div>}
    </header>
  );
};

export default PageHeader;
