((token) => {
  const nodes = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role],h1,h2,h3')).slice(0, 500);
  if (!(window.__agentHubSnapshots instanceof Map)) window.__agentHubSnapshots = new Map();
  window.__agentHubSnapshots.set(token, {url:location.href,nodes});
  while (window.__agentHubSnapshots.size > 8) window.__agentHubSnapshots.delete(window.__agentHubSnapshots.keys().next().value);
  return {url:location.href,title:document.title,revision:String(performance.timeOrigin),text:(document.body?.innerText || '').slice(0,32000),elements:nodes.map((el,index)=>({ref:token + ":" + index,tag:el.tagName.toLowerCase(),text:(el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').slice(0,200),type:el.getAttribute('type'),role:el.getAttribute('role'),disabled:el.disabled || false}))};
})("__SNAPSHOT_ID__")
