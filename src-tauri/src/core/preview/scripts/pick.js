function pickElement(x, y) {
  const context = __ELEMENT_CONTEXT__;
  const scale = window.visualViewport?.scale || 1;
  const el = context.hit(
    x / scale + (window.visualViewport?.offsetLeft || 0),
    y / scale + (window.visualViewport?.offsetTop || 0),
  );
  return el ? context.describe(el) : null;
}
