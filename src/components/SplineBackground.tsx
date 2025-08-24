'use client';

import Spline from '@splinetool/react-spline';

export default function SplineBackground() {
  return (
    <div 
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 1 }}
    >
      <Spline
        scene="https://prod.spline.design/4XuLUrstfCHJ79xe/scene.splinecode"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}