#!/usr/bin/env node
// Where does a parity diff come from? For each box (CSS px) of a screen captured with
// `node tools/parity.mjs --raw <id>`, finds the whole-device-pixel move of the build that best matches
// the reference, and the parity % if only that box (and then all boxes) were moved.
//   node tools/parity-align.mjs s-role-sunflower "sub:16,120,300,46" "title:16,50,200,68"
// "dx 1 dy 0" = the build must move 1 device px right. Same scoring as tools/parity.mjs.
import sharp from 'sharp';
import pixelmatch from 'pixelmatch';

const [name, ...boxes] = process.argv.slice(2);
if (!name || !boxes.length) {
  console.error('usage: node tools/parity-align.mjs <id-theme> "label:x,y,w,h" ...');
  process.exit(1);
}
const file = (k) => `.shots/parity/raw/${name}-${k}.png`;
const ref = await sharp(file('ref')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const bld = await sharp(file('build')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = bld.info;
const r = W / 375;
const grey = (buf, i) => buf[i] * 0.3 + buf[i + 1] * 0.59 + buf[i + 2] * 0.11;

const moved = (list) => {
  const out = Buffer.from(bld.data);
  for (const { x, y, w, h, dx, dy } of list)
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        bld.data.copy(
          out,
          (yy * W + xx) * 4,
          ((yy - dy) * W + xx - dx) * 4,
          ((yy - dy) * W + xx - dx) * 4 + 4,
        );
  return out;
};
const norm = (raw) =>
  sharp(raw, { raw: { width: W, height: H, channels: 4 } })
    .resize(375, Math.round(H / r), { fit: 'fill', kernel: 'lanczos3' })
    .ensureAlpha()
    .raw()
    .toBuffer();
const a = await norm(ref.data);
const pct = async (raw) =>
  (
    (pixelmatch(a, await norm(raw), null, 375, Math.round(H / r), { threshold: 0.1 }) /
      (375 * Math.round(H / r))) *
    100
  ).toFixed(2);

const found = boxes.map((b) => {
  const [label, rest] = b.split(':');
  const [x, y, w, h] = rest.split(',').map((v) => Math.round(Number(v) * r));
  const score = (dx, dy) => {
    let s = 0;
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        s += Math.abs(grey(ref.data, (yy * W + xx) * 4) - grey(bld.data, ((yy - dy) * W + xx - dx) * 4));
    return s;
  };
  let best = { dx: 0, dy: 0, s: score(0, 0) };
  const base = best.s;
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const s = score(dx, dy);
      if (s < best.s) best = { dx, dy, s };
    }
  return { label, x, y, w, h, dx: best.dx, dy: best.dy, gain: base ? 1 - best.s / base : 0 };
});

console.log(`${name}: now ${await pct(bld.data)}%`);
for (const f of found)
  console.log(
    `  ${f.label.padEnd(12)} dx ${f.dx} dy ${f.dy}  match +${(f.gain * 100).toFixed(0)}%  alone → ${await pct(moved([f]))}%`,
  );
console.log(`  all moved → ${await pct(moved(found))}%`);
