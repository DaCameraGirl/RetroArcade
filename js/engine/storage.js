// High scores – localStorage
const Scores = (() => {
  const KEY = 'retroarcade_scores_v1';
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
  }
  function save(scores) {
    localStorage.setItem(KEY, JSON.stringify(scores));
  }
  function get(game) {
    return (load()[game] || []).slice(0, 10);
  }
  function submit(game, score, name = 'AAA') {
    const all = load();
    const list = all[game] || [];
    list.push({ score, name, date: new Date().toISOString().slice(0,10) });
    list.sort((a,b) => b.score - a.score);
    all[game] = list.slice(0, 10);
    save(all);
    return all[game].findIndex(e => e.score === score && e.name === name);
  }
  return { get, submit };
})();
