import { useEffect, useState, type RefObject } from "react";

type ElementSize = {
  width: number;
  height: number;
};

export function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
  fallback: ElementSize,
  minSize: ElementSize = { width: 320, height: 260 },
) {
  const [size, setSize] = useState<ElementSize>(fallback);

  useEffect(() => {
    const target = ref.current;
    if (!target) return;

    const updateSize = () => {
      const rect = target.getBoundingClientRect();
      const width = Math.max(minSize.width, Math.round(rect.width || fallback.width));
      const height = Math.max(minSize.height, Math.round(rect.height || fallback.height));

      setSize(current => (
        current.width === width && current.height === height
          ? current
          : { width, height }
      ));
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(target);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  });

  return size;
}
