// js/utils/dom.js

const injected = new Set();

// Adds a component's styles to the page once, however many times it is created.
export function injectStyle(id, css) {
  if (injected.has(id)) return;
  injected.add(id);
  const el = document.createElement('style');
  el.id = 'style-' + id;
  el.textContent = css;
  document.head.append(el);
}

// Tiny element builder: h('div', { class: 'x', onClick: fn, text: 'hi' }, child, child)
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'style') el.style.cssText = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  kids.flat().forEach((kid) => {
    if (kid == null || kid === false) return;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  });
  return el;
}
