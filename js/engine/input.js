// Input: keyboard + touch dpad
const Input = (() => {
  const keys = {};
  const held = new Set();

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['arrowup','arrowdown','arrowleft','arrowright',' ','z','p','q'].includes(k) || k.startsWith('arrow')) {
      e.preventDefault();
    }
    keys[k] = true;
    held.add(k);
    ArcadeEvents.emit('keydown', k, e);
  });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    keys[k] = false;
    held.delete(k);
    ArcadeEvents.emit('keyup', k, e);
  });

  function isDown(...names) {
    return names.some(n => keys[n.toLowerCase()]);
  }
  function dir() {
    let x = 0, y = 0;
    if (isDown('arrowleft','a')) x -= 1;
    if (isDown('arrowright','d')) x += 1;
    if (isDown('arrowup','w')) y -= 1;
    if (isDown('arrowdown','s')) y += 1;
    return {x, y};
  }
  function action() { return isDown(' ', 'z', 'enter'); }

  return { keys, isDown, dir, action };
})();
