"use client";

import { useEffect, useRef } from "react";
import type p5 from "p5";

interface Props {
  sketch: (p: p5) => void;
}

export default function P5Canvas({ sketch }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let instance: p5;

    import("p5").then(({ default: P5 }) => {
      if (containerRef.current) {
        instance = new P5(sketch, containerRef.current);
      }
    });

    return () => {
      instance?.remove();
    };
    // sketch identity must be stable (passed from useMemo or module scope)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
