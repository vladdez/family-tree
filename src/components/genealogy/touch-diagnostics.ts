export type TouchTrace = (step: string, details?: Record<string, unknown>) => void;
const sessions = new WeakMap<HTMLElement, {
  counts: Record<string, number>; history: Record<string, unknown>[]; started: number;
}>();

// Opt-in support panel. Normal visits do not install diagnostic listeners.
// Observations stay in this page until the user copies the report.
export function installTouchDiagnostics(viewport: HTMLElement): { trace?: TouchTrace; cleanup: () => void } {
  if (new URLSearchParams(window.location.search).get('touch-check') !== '1') return { cleanup() {} };
  const english = document.documentElement.lang === 'en';
  const panel = document.createElement('aside');
  panel.className = 'tree-touch-check';
  panel.setAttribute('aria-label', english ? 'Touch check' : 'Проверка касаний');
  const instruction = document.createElement('p');
  instruction.textContent = english
    ? 'Drag the tree, then copy the report and send it in the chat.'
    : 'Проведите пальцем по древу, затем скопируйте отчёт и отправьте его в чат.';
  const status = document.createElement('p');
  const copy = document.createElement('button');
  copy.type = 'button'; copy.className = 'button';
  copy.textContent = english ? 'Copy report' : 'Скопировать отчёт';
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = english ? 'Report text' : 'Текст отчёта';
  const output = document.createElement('textarea');
  output.readOnly = true;
  output.setAttribute('aria-label', english ? 'Touch report' : 'Отчёт о касаниях');
  details.append(summary, output);
  panel.append(instruction, status, copy, details);
  viewport.parentElement?.insertBefore(panel, viewport);

  let session = sessions.get(viewport);
  if (!session) { session = { counts: {}, history: [], started: performance.now() }; sessions.set(viewport, session); }
  const { counts, history, started } = session;
  const describe = (target: EventTarget | null) => target instanceof Element
    ? [target.tagName.toLowerCase(), ...Array.from(target.classList)].join('.') : String(target);
  const transform = () => viewport.querySelector<HTMLElement>('.tree-canvas')?.style.transform ?? null;
  const initialTransform = transform();
  const info = {
    version: 'touch-check-1', language: document.documentElement.lang,
    browser: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints,
    touchEvents: 'ontouchstart' in window, pointerEvents: 'PointerEvent' in window,
    initialTransform,
  };
  let scheduled = 0;
  const render = () => {
    window.clearTimeout(scheduled);
    scheduled = 0;
    const box = viewport.getBoundingClientRect();
    output.value = JSON.stringify({
      ...info, counts, transform: transform(),
      viewport: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height),
        touchAction: getComputedStyle(viewport).touchAction, inert: !!viewport.closest('[inert]'),
        centerTarget: describe(document.elementFromPoint(box.left + box.width / 2, Math.max(0, Math.min(innerHeight - 1, box.top + box.height / 2)))) },
      history,
    }, null, 2);
    status.textContent = english
      ? `Touches in tree: ${counts['tree:touchstart'] ?? 0}; moves handled: ${counts['handler:pan'] ?? 0}; view changes: ${counts['view:change'] ?? 0}`
      : `Касания древа: ${counts['tree:touchstart'] ?? 0}; движения обработаны: ${counts['handler:pan'] ?? 0}; изменения вида: ${counts['view:change'] ?? 0}`;
  };
  const trace: TouchTrace = (step, data = {}) => {
    counts[step] = (counts[step] ?? 0) + 1;
    history.push({ ms: Math.round(performance.now() - started), step, ...data });
    if (history.length > 35) history.shift();
    if (!scheduled) scheduled = window.setTimeout(render, 150);
  };
  const observe = (event: Event) => {
    const inTree = event.composedPath().includes(viewport);
    const name = `${inTree ? 'tree' : 'page'}:${event.type}`;
    if (event.type.includes('move') && !inTree) return;
    const data: Record<string, unknown> = { target: describe(event.target), cancelable: event.cancelable, prevented: event.defaultPrevented };
    if ('touches' in event) data.touches = (event as TouchEvent).touches.length;
    if ('pointerType' in event) data.pointerType = (event as PointerEvent).pointerType;
    if (event.target instanceof Element) data.touchAction = getComputedStyle(event.target).touchAction;
    trace(name, data);
  };
  const events = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel'];
  for (const name of events) document.addEventListener(name, observe, { capture: true, passive: true });
  const errors = (event: ErrorEvent) => trace('error', { message: event.message });
  window.addEventListener('error', errors);
  let lastTransform = initialTransform;
  const observer = new MutationObserver(() => {
    const next = transform();
    if (next !== lastTransform) { lastTransform = next; trace('view:change', { transform: next }); }
  });
  observer.observe(viewport, { attributes: true, subtree: true, attributeFilter: ['style'] });
  copy.addEventListener('click', async () => {
    render();
    try {
      await navigator.clipboard.writeText(output.value);
      copy.textContent = english ? 'Copied — paste in the chat' : 'Скопировано — вставьте в чат';
    } catch {
      details.open = true; output.focus(); output.select(); output.setSelectionRange(0, output.value.length);
      copy.textContent = english ? 'Select and copy the report below' : 'Выделите и скопируйте отчёт ниже';
    }
  });
  trace('ready'); render();
  return { trace, cleanup() {
    trace('detached');
    for (const name of events) document.removeEventListener(name, observe, true);
    window.removeEventListener('error', errors);
    observer.disconnect(); window.clearTimeout(scheduled); panel.remove();
  } };
}
