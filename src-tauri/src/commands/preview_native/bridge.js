(() => {
  const state = {
    picking: false,
    captured: null,
    cancelled: false,
    navigation: 0,
  };
  const pick = __PICK_FUNCTION__;
  for (const name of ["pushState", "replaceState"]) {
    const original = history[name];
    history[name] = function (...args) {
      const result = original.apply(this, args);
      state.navigation++;
      return result;
    };
  }
  addEventListener("popstate", () => state.navigation++);
  addEventListener("hashchange", () => state.navigation++);
  let marker;
  const hide = () => {
    marker?.remove();
    marker = undefined;
  };
  state.enable = (enabled) => {
    state.picking = enabled;
    state.cancelled = false;
    if (!enabled) hide();
  };
  for (const type of ["wheel", "mousedown", "keydown"])
    addEventListener(
      type,
      (event) => {
        if (state.captureBusy) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      { capture: true, passive: false },
    );
  addEventListener(
    "mousemove",
    (event) => {
      if (!state.picking) return;
      const node = document.elementFromPoint(event.clientX, event.clientY);
      if (!node) return;
      const box = node.getBoundingClientRect();
      if (!marker) {
        marker = document.createElement("div");
        marker.style.cssText =
          "position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #89b4fa;background:rgba(137,180,250,.12);box-sizing:border-box";
        document.documentElement.append(marker);
      }
      Object.assign(marker.style, {
        left: box.x + "px",
        top: box.y + "px",
        width: box.width + "px",
        height: box.height + "px",
      });
    },
    true,
  );
  addEventListener(
    "click",
    (event) => {
      if (!state.picking) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      hide();
      const value = pick(event.clientX, event.clientY);
      state.captured = value && {
        value,
        revision:
          String(performance.timeOrigin) +
          ":" +
          state.navigation +
          ":" +
          location.href,
        url: location.href,
      };
      state.picking = false;
    },
    true,
  );
  addEventListener(
    "keydown",
    (event) => {
      if (state.picking && event.key === "Escape") {
        state.enable(false);
        state.cancelled = true;
        event.preventDefault();
      }
    },
    true,
  );
  Object.defineProperty(window, "__agentHubNativePreview", {
    value: state,
    configurable: false,
  });
})();
