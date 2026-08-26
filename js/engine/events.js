// Tiny event bus
const ArcadeEvents = (() => {
  const m = new Map();
  return {
    on(ev, fn) { if (!m.has(ev)) m.set(ev, []); m.get(ev).push(fn); },
    off(ev, fn) { const a = m.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    emit(ev, ...args) { (m.get(ev) || []).forEach(fn => fn(...args)); }
  };
})();
