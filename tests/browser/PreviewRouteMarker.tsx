import { useLocation } from "react-router-dom";

export function PreviewRouteMarker() {
  const location = useLocation();
  return (
    <output id="preview-route" hidden>
      {location.pathname + location.search}
    </output>
  );
}
