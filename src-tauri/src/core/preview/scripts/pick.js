function pickElement(x, y) {
  const viewportScale = window.visualViewport?.scale || 1;
  const offsetX = window.visualViewport?.offsetLeft || 0, offsetY = window.visualViewport?.offsetTop || 0;
  const el = document.elementFromPoint(x / viewportScale + offsetX, y / viewportScale + offsetY);
  if (!el) return null;
  const r = el.getBoundingClientRect(), css = getComputedStyle(el);
  const selector = el.id ? '#' + CSS.escape(el.id) : (() => {
    const parts = []; let item = el;
    for (let i = 0; item && i < 6; i++, item = item.parentElement) {
      const parent = item.parentElement;
      parts.unshift(item.tagName.toLowerCase() + (parent ? ':nth-child(' + (Array.prototype.indexOf.call(parent.children, item) + 1) + ')' : ''));
    }
    return parts.join(' > ');
  })();
  const domPath = []; let parent = el;
  while (parent && domPath.length < 32) {
    domPath.unshift((parent.tagName.toLowerCase() + (parent.id ? '#' + parent.id : parent.parentElement ? ':nth-child('+(Array.prototype.indexOf.call(parent.parentElement.children,parent)+1)+')' : '')).slice(0,200));
    parent = parent.parentElement;
  }
  return {
    domPath,
    selector, text: (el.innerText || el.textContent || '').slice(0, 2000), html: el.outerHTML.slice(0, 4096),
    role: el.getAttribute('role'), label: el.getAttribute('aria-label'),
    bounds: {x:(r.x-offsetX)*viewportScale,y:(r.y-offsetY)*viewportScale,width:r.width*viewportScale,height:r.height*viewportScale},
    documentBounds: {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height},
    styles: Object.fromEntries(['color','background-color','font-family','font-size','font-weight','line-height','padding','margin','display','gap','border-radius'].map(k=>[k,css.getPropertyValue(k)])),
    url:location.href, title:document.title, revision:String(performance.timeOrigin),
    viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollX,scrollY,scale:viewportScale}
  };
}
