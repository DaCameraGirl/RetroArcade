// Canvas helpers
const Canvas = {
  clear(ctx, w, h, color = '#000') {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
  },
  text(ctx, str, x, y, size = 16, color = '#0f0', align = 'left') {
    ctx.fillStyle = color;
    ctx.font = `${size}px "Courier New", monospace`;
    ctx.textAlign = align;
    ctx.fillText(str, x, y);
  },
  rect(ctx, x, y, w, h, color = '#fff', fill = true) {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    fill ? ctx.fillRect(x, y, w, h) : ctx.strokeRect(x, y, w, h);
  },
  circle(ctx, x, y, r, color = '#fff', fill = true) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    fill ? (ctx.fillStyle = color, ctx.fill()) : (ctx.strokeStyle = color, ctx.stroke());
  },
  collide(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  },
  clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
  rand(min, max) { return Math.random() * (max - min) + min; },
  lerp(a, b, t) { return a + (b - a) * t; }
};
