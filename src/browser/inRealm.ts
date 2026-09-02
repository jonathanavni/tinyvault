export const DESTINATION_PREDICATES_SOURCE = `function () {
  var el = this;
  var getAttributeDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'getAttribute');
  if (!getAttributeDescriptor || typeof getAttributeDescriptor.value !== 'function') return false;
  var getAttribute = getAttributeDescriptor.value;
  if (Object.prototype.toString.call(el) !== '[object HTMLInputElement]') return false;
  var declaredType = getAttribute.call(el, 'type');
  if (typeof declaredType !== 'string' || declaredType.toLowerCase() !== 'password') return false;
  if (el.type !== 'password' || el.disabled || el.readOnly || el.hasAttribute('hidden')) return false;
  if (!el.isConnected || window.top !== window || !el.form) return false;
  var form = el.form;
  var action = getAttribute.call(form, 'action');
  if (new URL(action === null ? '' : action, location.href).origin !== location.origin) return false;
  var descriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'elements');
  if (!descriptor || typeof descriptor.get !== 'function') return false;
  var controls = descriptor.get.call(form);
  for (var index = 0; index < controls.length; index += 1) {
    var control = controls[index];
    var tag = String(control.tagName || '').toLowerCase();
    var type = String(getAttribute.call(control, 'type') || '').toLowerCase();
    var submits = tag === 'button' || (tag === 'input' && (type === 'submit' || type === 'image'));
    if (!submits) continue;
    var formaction = getAttribute.call(control, 'formaction');
    if (formaction !== null && new URL(formaction, location.href).origin !== location.origin) return false;
  }
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  for (var ancestor = el; ancestor; ancestor = ancestor.parentElement) {
    var filter = window.getComputedStyle(ancestor).filter.replace(/\\s/gu, '');
    if (filter.includes('opacity(0)')) return false;
  }
  var rect = el.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return false;
  var x = rect.left + rect.width / 2;
  var y = rect.top + rect.height / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  var hit = document.elementFromPoint(x, y);
  if (hit === el || (hit !== null && el.contains(hit))) return true;
  return Object.prototype.toString.call(hit) === '[object HTMLLabelElement]' && hit.control === el;
}`;

export const VERIFY_DESTINATION_SOURCE = `function () {
  var destinationPredicates = ${DESTINATION_PREDICATES_SOURCE};
  return destinationPredicates.call(this);
}`;

export const ASSIGN_SOURCE = `function (expectedOrigin, hex, lengthDigits) {
  var el = this;
  var observedOrigin = location.origin;
  if (window.top !== window || observedOrigin !== expectedOrigin) {
    return { assigned: false, reason: 'origin', observedOrigin: observedOrigin };
  }
  var destinationPredicates = ${DESTINATION_PREDICATES_SOURCE};
  if (!destinationPredicates.call(el)) return { assigned: false, reason: 'identity' };
  var getAttributeDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'getAttribute');
  if (!getAttributeDescriptor || typeof getAttributeDescriptor.value !== 'function') {
    return { assigned: false, reason: 'identity' };
  }
  var getAttribute = getAttributeDescriptor.value;
  var controlToken = getAttribute.call(el, 'data-tv-control');
  var documentToken = getAttribute.call(document.documentElement, 'data-tv-document');
  var length = Number(lengthDigits);
  var decoded = '';
  for (var index = 0; index < 4096; index += 1) {
    decoded += String.fromCharCode(Number.parseInt(hex.slice(index * 4, index * 4 + 4), 16));
  }
  decoded = decoded.slice(0, length);
  var descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (!descriptor || typeof descriptor.set !== 'function') return { assigned: false, reason: 'identity' };
  descriptor.set.call(el, decoded);
  el.dispatchEvent(new Event('focus'));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur'));
  return {
    assigned: true,
    observedOrigin: observedOrigin,
    controlToken: controlToken,
    documentToken: documentToken
  };
}`;

export const TYPE_SOURCE = `function (text) {
  if (!this.isConnected) return false;
  var tag = Object.prototype.toString.call(this);
  var prototype = tag === '[object HTMLInputElement]' ? HTMLInputElement.prototype :
    tag === '[object HTMLTextAreaElement]' ? HTMLTextAreaElement.prototype :
    tag === '[object HTMLSelectElement]' ? HTMLSelectElement.prototype : null;
  if (prototype === null) return false;
  var descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (!descriptor || typeof descriptor.set !== 'function') return false;
  descriptor.set.call(this, text);
  this.dispatchEvent(new Event('focus'));
  this.dispatchEvent(new Event('input', { bubbles: true }));
  this.dispatchEvent(new Event('change', { bubbles: true }));
  this.dispatchEvent(new Event('blur'));
  return true;
}`;

export const SNAPSHOT_SOURCE = `function () {
  var root = this;
  var getAttributeDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'getAttribute');
  if (!getAttributeDescriptor || typeof getAttributeDescriptor.value !== 'function') {
    return { url: location.origin + location.pathname, nodes: [] };
  }
  var getAttribute = getAttributeDescriptor.value;
  var tainted = Array.prototype.slice.call(arguments);
  var selector = 'input,textarea,select,button,a[href],h1,h2,h3,h4,h5,h6,label,p,span,div';
  var elements = root.querySelectorAll(selector);
  var nodes = [];
  function ownText(element) {
    var text = '';
    for (var child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === Node.TEXT_NODE) text += child.textContent || '';
    }
    return text.trim();
  }
  for (var index = 0; index < elements.length; index += 1) {
    var element = elements[index];
    var tag = String(element.tagName || '').toLowerCase();
    var text = ownText(element);
    if ((tag === 'p' || tag === 'span' || tag === 'div') && text.length === 0) continue;
    var type = tag === 'input' ? String(element.type || '').toLowerCase() : '';
    var masked = type === 'password' || tainted.indexOf(element) !== -1;
    if (masked) {
      nodes.push({ tag: tag, masked: true });
    } else {
      var node = { tag: tag, masked: false };
      var role = getAttribute.call(element, 'role');
      var labels = element.labels;
      var labelText = labels && labels.length > 0 ? String(labels[0].textContent || '').trim() : '';
      var name = getAttribute.call(element, 'aria-label') || labelText ||
        getAttribute.call(element, 'placeholder') || getAttribute.call(element, 'name') || text;
      var value = tag === 'input' || tag === 'textarea' || tag === 'select' ? String(element.value) : '';
      if (role !== null) node.role = role.slice(0, 200);
      if (name) node.name = String(name).slice(0, 200);
      if (value) node.value = value.slice(0, 200);
      nodes.push(node);
    }
  }
  return { url: location.origin + location.pathname, nodes: nodes };
}`;
