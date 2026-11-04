// Small DOM components; no framework, signing, RPC or authority over capabilities.
export const UNKNOWN = '—';
export function valueText(value) {
  if (value == null || (typeof value === 'number' && !Number.isFinite(value))) return UNKNOWN;
  const text = String(value).trim();
  return !text || /^(?:unknown|unavailable|nan|undefined|null|—|–)$/i.test(text) ? UNKNOWN : text;
}
export function formatNumber(value, digits = 0) {
  if (valueText(value) === UNKNOWN || typeof value === 'boolean') return UNKNOWN;
  if (digits === 0 && /^-?\d+$/.test(String(value))) return BigInt(value).toLocaleString('en-US');
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits: digits }) : UNKNOWN;
}
export function formatAmount(amount) {
  const value = formatNumber(amount?.sqk, 4);
  return value === UNKNOWN ? UNKNOWN : `${value} SQK`;
}
export function Skeleton(node, busy) {
  node.dataset.component = 'Skeleton';
  const loading = Boolean(busy && valueText(node.textContent) === UNKNOWN);
  node.classList.toggle('is-skeleton', loading);
  if (loading) node.setAttribute('aria-label', 'Loading');
  else node.removeAttribute('aria-label');
}
export function Panel(node) {
  node.dataset.component = 'Panel';
  const heading = node.querySelector('h2, h3');
  if (heading) {
    heading.id ||= `${node.id || `panel-${[...node.ownerDocument.querySelectorAll('.panel')].indexOf(node)}`}-title`;
    node.setAttribute('role', 'region'); node.setAttribute('aria-labelledby', heading.id);
  }
  return { setBusy(busy) {
    node.setAttribute('aria-busy', String(busy));
    node.querySelectorAll('.stat strong').forEach(value => Skeleton(value, busy));
  } };
}
export function Stat(node) {
  node.dataset.component = 'Stat';
  const value = node.querySelector('strong');
  return { set(next, formatter = valueText) {
    value.textContent = valueText(formatter(next));
    Skeleton(value, node.closest('[aria-busy="true"]') !== null);
  } };
}
export function Table({ head, body, columns, rows, cell, caption = 'Squeek holdings at the verified snapshot' }) {
  const doc = body.ownerDocument, table = body.closest('table');
  table.dataset.component = 'Table'; table.setAttribute('role', 'table'); body.setAttribute('role', 'rowgroup');
  if (!table.caption) { const node = table.createCaption(); node.className = 'sr-only'; node.textContent = caption; }
  const heading = doc.createElement('tr'); heading.setAttribute('role', 'row');
  for (const column of columns) {
    const node = doc.createElement('th'); node.setAttribute('role', 'columnheader'); node.scope = 'col'; node.textContent = column.label;
    if (column.num) node.className = 'num';
    heading.append(node);
  }
  head.replaceChildren(heading);
  body.replaceChildren(...rows.map(row => {
    const node = doc.createElement('tr'); node.setAttribute('role', 'row');
    for (const column of columns) {
      const td = doc.createElement('td'); td.dataset.label = column.label; td.setAttribute('role', 'cell');
      if (column.num) td.className = 'num';
      const content = cell(row, column);
      if (content?.nodeType) td.append(content); else td.textContent = valueText(content);
      node.append(td);
    }
    return node;
  }));
}
export function TokenCard({ doc, item, onOpen }) {
  const card = doc.createElement('button'); card.type = 'button';
  card.dataset.component = 'TokenCard'; card.className = 'art-card';
  card.setAttribute('aria-label', `View ${item.name ?? `Squeek #${item.tokenId}`}`);
  const image = doc.createElement('img');
  image.src = item.image; // Isolated image only: never parse SVG/metadata as HTML.
  image.alt = item.name ?? `Squeek #${item.tokenId}`; image.loading = 'lazy';
  const label = doc.createElement('span'); label.className = 'token'; label.textContent = `#${valueText(item.tokenId)}`;
  card.append(image, label); card.onclick = onOpen;
  return card;
}
export function Toast({ doc, host, message, kind = '', timeout = kind === 'err' ? 0 : 6000, action, onAction }) {
  const node = doc.createElement('div'); node.dataset.component = 'Toast';
  node.className = `toast ${kind}`; node.setAttribute('role', kind === 'err' ? 'alert' : 'status');node.setAttribute('aria-atomic','true');
  const text=doc.createElement('span');text.className='toast-message';text.textContent=message;node.append(text);
  let timer;const close=()=>{doc.defaultView.clearTimeout(timer);node.remove();};
  if(action&&onAction){const button=doc.createElement('button');button.className='btn toast-action';button.textContent=action;button.onclick=()=>{close();onAction();};node.append(button);}
  const dismiss=doc.createElement('button');dismiss.className='btn toast-close';dismiss.textContent='×';dismiss.setAttribute('aria-label','Dismiss notification');dismiss.onclick=close;node.append(dismiss);host.append(node);
  if(timeout>0)timer=doc.defaultView.setTimeout(close,timeout);
  return node;
}

export function ConfirmDialog({ doc, win, elements }) {
  elements.root.dataset.component = "ConfirmDialog";
  let closeActiveModal = null;

  function openModal({ initialFocus = elements.cancel, onClose }) {
    const previousFocus = doc.activeElement;
    const box = elements.root.querySelector(".modal-box");
    const focusable = () => [...box.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
      .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('.hidden, [hidden], [inert]')
        && win.getComputedStyle(node).display !== "none" && win.getComputedStyle(node).visibility !== "hidden");
    const focusInside = () => {
      const nodes = focusable();
      (nodes.includes(initialFocus) ? initialFocus : nodes[0] ?? box).focus();
    };
    const close = (value = false) => {
      if (closeActiveModal !== close) return;
      closeActiveModal = null;
      doc.removeEventListener("keydown", onKeyDown, true);
      doc.removeEventListener("focusin", onFocusIn);
      elements.root.classList.add("hidden");
      onClose(value);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
    const onKeyDown = event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(false);
      } else if (event.key === "Tab") {
        event.preventDefault();
        const nodes = focusable();
        const index = nodes.indexOf(doc.activeElement);
        const next = index < 0 ? (event.shiftKey ? nodes.length - 1 : 0)
          : (index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length;
        (nodes[next] ?? box).focus();
      }
    };
    const onFocusIn = event => { if (!box.contains(event.target)) focusInside(); };
    closeActiveModal = close;
    elements.root.querySelector('[for="modal-input"]').classList.toggle('hidden', elements.input.classList.contains('hidden'));
    elements.root.classList.remove("hidden");
    doc.addEventListener("keydown", onKeyDown, true);
    doc.addEventListener("focusin", onFocusIn);
    focusInside();
    return close;
  }

  function confirmModal({ title, body, requireText = null, confirmLabel = "Confirm", details = [] }) {
    closeActiveModal?.();
    return new Promise((resolve) => {
      elements.title.textContent = title;
      elements.body.textContent = body;
      if(details.length) {
        const list=doc.createElement('dl');list.className='confirm-details';list.dataset.testid='confirm-details';
        for(const [label,value,options] of details) {const term=doc.createElement('dt'),definition=doc.createElement('dd');term.textContent=label;definition.textContent=value;if(options?.warning){term.className=definition.className='recipient-warning';}list.append(term,definition);}elements.body.append(list);
      }
      elements.input.value = "";
      elements.input.classList.toggle("hidden", !requireText);
      elements.input.placeholder = requireText ? `type ${requireText}` : "";
      elements.input.setAttribute("aria-label", requireText ? `Type ${requireText} to acknowledge permanent burn` : "Confirmation");
      elements.confirm.textContent = confirmLabel;
      elements.confirm.disabled = Boolean(requireText);
      const close = openModal({
        initialFocus: requireText ? elements.input : elements.cancel,
        onClose: value => {
          elements.confirm.onclick = null;
          elements.cancel.onclick = null;
          elements.input.oninput = null;
          resolve(value);
        },
      });
      elements.input.oninput = () => {
        elements.confirm.disabled = requireText ? elements.input.value.trim() !== requireText : false;
      };
      elements.cancel.onclick = () => close(false);
      elements.confirm.onclick = () => {
        if (requireText && elements.input.value.trim() !== requireText) return;
        close(true);
      };
    });
  }

  return { open: openModal, confirm: confirmModal, close: () => closeActiveModal?.() };
}
