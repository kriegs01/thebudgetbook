import React, { useState, useEffect } from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Step 1: Float up and extrude shadow
    const t1 = setTimeout(() => setStep(1), 100);
    // Step 2: Squeeze in
    const t2 = setTimeout(() => setStep(2), 700);
    // Step 3: Release squeeze
    const t3 = setTimeout(() => setStep(3), 1300);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // Faceted 3D extrusion effect using hard layered text shadows
  const fullShadow = `
    1px 1px 0px #d946ef, 2px 2px 0px #d946ef, 3px 3px 0px #d946ef,
    4px 4px 0px #14b8a6, 5px 5px 0px #14b8a6, 6px 6px 0px #14b8a6,
    7px 7px 0px #f59e0b, 8px 8px 0px #f59e0b, 9px 9px 0px #f59e0b,
    10px 10px 0px #0f172a
  `;

  const flatShadow = `
    0px 0px 0px #d946ef, 0px 0px 0px #d946ef, 0px 0px 0px #d946ef,
    0px 0px 0px #14b8a6, 0px 0px 0px #14b8a6, 0px 0px 0px #14b8a6,
    0px 0px 0px #f59e0b, 0px 0px 0px #f59e0b, 0px 0px 0px #f59e0b,
    0px 0px 0px #0f172a
  `;

  const prismaticShadow = step >= 1 ? fullShadow : flatShadow;

  // Determine translate utility classes based on the animation step
  const getTransform = (hoverClass: string, squeezeClass: string) => {
    const y = step === 0 ? 'translate-y-4' : 'translate-y-0';
    const x = step === 2 ? squeezeClass : '';
    // Only apply the hover transformation if we are not actively forcing the squeeze
    return `${y} ${x} ${step !== 2 ? hoverClass : ''}`;
  };

  return (
    <div className={`relative flex items-center justify-center tracking-tight cursor-pointer group ${className}`}>
      {/* Main text with 3D faceted shadow */}
      <div className="relative z-10 flex items-center justify-center text-slate-50 pr-[10px] pb-[10px]" style={{ WebkitTextStroke: '1px #0f172a' }}>
        <span style={{ textShadow: prismaticShadow }} className={`font-titan transition-all duration-500 rotate-[-6deg] ${getTransform('group-hover:translate-x-2', 'translate-x-2')}`}>B</span>
        <span style={{ textShadow: prismaticShadow }} className={`font-titan transition-all duration-500 rotate-[3deg] ${getTransform('group-hover:translate-x-1', 'translate-x-1')}`}>u</span>
        <span style={{ textShadow: prismaticShadow }} className={`font-titan transition-all duration-500 rotate-[-4deg] ${getTransform('', '')}`}>d</span>
        <span style={{ textShadow: prismaticShadow }} className={`font-titan transition-all duration-500 rotate-[5deg] ${getTransform('group-hover:-translate-x-1', '-translate-x-1')}`}>e</span>
        <span style={{ textShadow: prismaticShadow }} className={`font-titan transition-all duration-500 rotate-[-3deg] ${getTransform('group-hover:-translate-x-2', '-translate-x-2')}`}>e</span>
      </div>
    </div>
  );
};