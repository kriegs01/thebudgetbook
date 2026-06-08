import React, { useState, useEffect } from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 100);
    const t2 = setTimeout(() => setStep(2), 700);
    const t3 = setTimeout(() => setStep(3), 1300);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const letterShadow = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';

  const getTransform = (hoverClass: string, squeezeClass: string) => {
    const y = step === 0 ? 'translate-y-4' : 'translate-y-0';
    const x = step === 2 ? squeezeClass : '';
    return `${y} ${x} ${step !== 2 ? hoverClass : ''}`;
  };

  return (
    <div
      className={`relative flex items-center justify-center tracking-tight cursor-pointer group ${className}`}
      style={{ filter: 'drop-shadow(3px 3px 0px rgba(0,0,0,0.9))' }}
    >
      <div
        className="relative z-10 flex items-center justify-center text-white pr-[10px] pb-[10px]"
        style={{ WebkitTextStroke: '1px #000' }}
      >
        <span
          style={{ textShadow: letterShadow }}
          className={`font-titan transition-all duration-500 rotate-[-6deg] ${getTransform('group-hover:translate-x-2', 'translate-x-2')}`}
        >
          B
        </span>
        <span
          style={{ textShadow: letterShadow }}
          className={`font-titan transition-all duration-500 rotate-[3deg] ${getTransform('group-hover:translate-x-1', 'translate-x-1')}`}
        >
          u
        </span>
        <span
          style={{ textShadow: letterShadow }}
          className={`font-titan transition-all duration-500 rotate-[-4deg] ${getTransform('', '')}`}
        >
          d
        </span>
        <span
          style={{ textShadow: letterShadow }}
          className={`font-titan transition-all duration-500 rotate-[5deg] ${getTransform('group-hover:-translate-x-1', '-translate-x-1')}`}
        >
          e
        </span>
        <span
          style={{ textShadow: letterShadow }}
          className={`font-titan transition-all duration-500 rotate-[-3deg] ${getTransform('group-hover:-translate-x-2', '-translate-x-2')}`}
        >
          e
        </span>
      </div>
    </div>
  );
};