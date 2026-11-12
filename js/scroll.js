// ===== ONE ENTRY PER <section>, SAME ORDER AS index.html =====
// [body, x (left -, right +), y, scale, dim]
const S = [
  ['sun', 0, -2.6, 2.3],      // hero: Sun rises from the bottom
  ['sun', -.85, 0, 1.25],
  ['mercury', .85, 0, .7],
  ['venus', -.85, 0, 1],
  ['earth', .85, 0, 1.1],
  ['moon', -.85, 0, .65],
  ['mars', .85, 0, .85],
  ['jupiter', -.85, 0, 1.3],
  ['saturn', .85, 0, .8],
  ['uranus', -.85, 0, 1],
  ['neptune', .85, 0, 1],
  ['earth', 0, .05, 1.4, .45], // creator
  ['earth', 0, -2.6, 2.3, .9]  // closing
];
// [accent, background glow] per body
const TH = {
  sun: ['#ffc94a', '#3a1305'], mercury: ['#c8ccd2', '#1a1c22'], venus: ['#f1d38a', '#33200a'],
  earth: ['#6ee7b7', '#0d2257'], moon: ['#e5e9f0', '#161e30'], mars: ['#ff8a4c', '#3a0f08'],
  jupiter: ['#ffb26b', '#2b180c'], saturn: ['#f3d88f', '#2d2209'], uranus: ['#7de8ee', '#07262b'], neptune: ['#5b8cff', '#081a4a']
};
const names = Object.keys(B);
const first = {}; S.forEach((s, i) => { if (first[s[0]] === undefined) first[s[0]] = i; });
const dirOf = {}; names.forEach((n, i) => dirOf[n] = i % 2 ? 1 : -1); // alternate rotation left/right

const secs = [...document.querySelectorAll('.sec')];
let tops = [];
const measure = () => { tops = secs.map(s => s.offsetTop); };
measure();
function progress() {
  let i = 0;
  for (let k = 0; k < tops.length; k++) if (scrollY >= tops[k] - 1) i = k;
  if (i >= tops.length - 1) return tops.length - 1;
  return i + (scrollY - tops[i]) / (tops[i + 1] - tops[i]);
}
const ease = t => { t = Math.min(Math.max(t, 0), 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

let mx = 0, my = 0;
addEventListener('mousemove', e => { mx = (e.clientX / innerWidth - .5) * 2; my = (e.clientY / innerHeight - .5) * 2; });

const root = document.documentElement.style;
const cA = new THREE.Color(), cB = new THREE.Color(), cC = new THREE.Color();
const baseRot = THREE.MathUtils.degToRad(-110.8 - 90); // Indonesia faces the camera
let ps = 0, spin = 0;

function animate() {
  requestAnimationFrame(animate);
  ps += (progress() - ps) * 0.08;
  const i = Math.min(Math.floor(ps), S.length - 2), t = ease(ps - i), a = S[i], b = S[i + 1];

  const aspect = innerWidth / innerHeight, mob = aspect < .9;
  spin += 0.0006;

  names.forEach(n => {
    const o = B[n]; let x, y, s, dim = 1;
    if (a[0] === n && b[0] === n) { x = mix(a[1], b[1], t); y = mix(a[2], b[2], t); s = mix(a[3], b[3], t); dim = mix(a[4] || 1, b[4] || 1, t); }
    else if (a[0] === n) { x = a[1]; y = a[2] + t * 3.4; s = a[3]; dim = a[4] || 1; }
    else if (b[0] === n) { x = b[1]; y = b[2] - (1 - t) * 3.4; s = b[3]; dim = b[4] || 1; }
    else { o.g.visible = false; return; }
    o.g.visible = true;
    const small = s < 2;
    o.g.position.set(mob ? 0 : x * Math.min(1, aspect / 1.5), y + (mob && small ? .5 : 0), 0);
    o.g.scale.setScalar(s * (mob && small ? .8 : 1));
    o.m.rotation.y = (n === 'earth' ? baseRot : 0) + spin + (ps - first[n]) * .8 * dirOf[n];
    if (o.a) o.a.uniforms.dim.value = dim;
    if (n === 'earth') B.earth.m.material.uniforms.dim.value = dim;
  });

  // city pings: only while the Earth section is on screen
  const w = Math.max(0, 1 - Math.abs(ps - first.earth)), now = performance.now() * .001;
  pings.forEach(p => {
    const k = (now * .6 + p.off) % 1;
    p.ring.scale.setScalar(1 + k * 5);
    p.ring.material.opacity = (1 - k) * w;
    p.dot.material.opacity = w;
  });

  // page colors follow the current planet
  const ta = TH[a[0]], tb = TH[b[0]];
  cA.set(ta[0]).lerp(cB.set(tb[0]), t); root.setProperty('--accent', '#' + cA.getHexString());
  cC.set(ta[1]).lerp(cB.set(tb[1]), t); root.setProperty('--bg', '#' + cC.getHexString());
  cC.multiplyScalar(.3); root.setProperty('--bg2', '#' + cC.getHexString());

  stars.rotation.y += .00006;
  stars.rotation.x = ps * .02;
  milky.rotation.y += .00002;
  milky.rotation.x = ps * .015;
  camera.position.x += (mx * .15 - camera.position.x) * .03;
  camera.position.y += (-my * .1 - camera.position.y) * .03;
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  measure();
});