import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Bring a linked settings section into view and move keyboard focus to it. */
export function useSectionAnchor(id: string) {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash !== `#${id}`) return;
    const frame = requestAnimationFrame(() => {
      const section = document.getElementById(id);
      section?.scrollIntoView({ block: "start" });
      section?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, id]);
}
