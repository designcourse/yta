'use client';

import Spline from '@splinetool/react-spline';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface SplineBackgroundProps {
  neriaX?: number;
  animateNeriaRing?: boolean;
  pathname?: string;
}

export default function SplineBackground({ neriaX, animateNeriaRing, pathname }: SplineBackgroundProps = {}) {
  const splineRef = useRef<any>(null);
  const hasAnimatedRef = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const currentPathname = usePathname();
  const activePathname = pathname || currentPathname;

  const trySetVariable = (spline: any, name: string, value: number) => {
    try {
      if (spline && typeof spline.setVariable === 'function') {
        spline.setVariable(name, value);
        return true;
      }
      if (spline && typeof spline.setVariables === 'function') {
        spline.setVariables({ [name]: value });
        return true;
      }
    } catch (e) {}
    return false;
  };

  // Forward global pointer moves to Spline canvas so it reacts even when covered by UI layers
  useEffect(() => {
    const handlePointerMove = (ev: PointerEvent) => {
      lastPointer.current = { x: ev.clientX, y: ev.clientY };
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const canvas = canvasRef.current;
          const coords = lastPointer.current;
          if (!canvas || !coords) return;
          const event = new PointerEvent('pointermove', {
            clientX: coords.x,
            clientY: coords.y,
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
          });
          canvas.dispatchEvent(event);
        });
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove as any);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (splineRef.current) {
      const spline = splineRef.current;

      // Set neria_x using variable if available, else fallback to object position
      if (neriaX !== undefined) {
        const setOk = trySetVariable(spline, 'neria_x', neriaX);
        if (!setOk) {
          const neriaXObject = spline.findObjectByName('neria_x');
          if (neriaXObject && neriaXObject.position) {
            neriaXObject.position.x = neriaX;
          }
        }
      }

      // Animate neria_ring if requested (variable preferred)
      if (animateNeriaRing) {
        const targetObj = spline.findObjectByName('neria_ring');
        let raf: number;
        const duration = 2000; // 2 seconds
        const startValue = 0;
        const endValue = 100;

        const loop = () => {
          const elapsed = Date.now() % duration; // repeat forever
          const progress = elapsed / duration;

          const easeOut = 1 - Math.pow(1 - progress, 3);
          const currentValue = startValue + (endValue - startValue) * easeOut;

          const setOk = trySetVariable(spline, 'neria_ring', currentValue);
          if (!setOk && targetObj && (targetObj as any).emissiveIntensity !== undefined) {
            (targetObj as any).emissiveIntensity = currentValue / 100;
          }

          raf = requestAnimationFrame(loop);
        };

        loop();

        return () => cancelAnimationFrame(raf);
      }
    }
  }, [neriaX, animateNeriaRing, activePathname]);

  // Special handling for collection page
  const isCollectionPage = activePathname === '/dashboard/collection';

  return (
    <div 
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 1 }}
      ref={containerRef}
    >
      <Spline
        scene="https://prod.spline.design/4XuLUrstfCHJ79xe/scene.splinecode"
        style={{ width: '100%', height: '100%' }}
        onLoad={(spline) => {
          splineRef.current = spline;
          // Capture the underlying canvas element for event forwarding
          try {
            const foundCanvas = containerRef.current?.querySelector('canvas') || null;
            canvasRef.current = foundCanvas;
          } catch {}

          if (isCollectionPage) {
            // Set neria_x for collection page (variable preferred)
            const setOkX = trySetVariable(spline, 'neria_x', -14.78);
            if (!setOkX) {
              const neriaXObject = spline.findObjectByName('neria_x');
              if (neriaXObject && neriaXObject.position) {
                neriaXObject.position.x = -14.78;
              }
            }

            // Start the ring animation once
            if (!hasAnimatedRef.current) {
              hasAnimatedRef.current = true;
              const targetObj = spline.findObjectByName('neria_ring');

              let raf: number;
              const duration = 2000;
              const startValue = 0;
              const endValue = 100;

              const loop = () => {
                const elapsed = Date.now() % duration; // repeat forever
                const progress = elapsed / duration;

                const easeOut = 1 - Math.pow(1 - progress, 3);
                const currentValue = startValue + (endValue - startValue) * easeOut;

                const setOk = trySetVariable(spline, 'neria_ring', currentValue);
                if (!setOk && targetObj && (targetObj as any).emissiveIntensity !== undefined) {
                  (targetObj as any).emissiveIntensity = currentValue / 100;
                }

                raf = requestAnimationFrame(loop);
              };

              loop();
            }
          }
        }}
      />
    </div>
  );
}