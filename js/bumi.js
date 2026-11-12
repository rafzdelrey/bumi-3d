(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("yr").textContent = new Date().getFullYear();

  /* ---------- scroll halus (Lenis) + reveal ---------- */
  if (!reduce && typeof Lenis !== "undefined") {
    const lenis = new Lenis({ duration: 1.15, smoothWheel: true, touchMultiplier: 1.5 });
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  const reveals = document.querySelectorAll("[data-reveal]");
  if (reduce) reveals.forEach((e) => e.classList.add("in"));
  else {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { threshold: 0.2, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach((e) => io.observe(e));
  }

  /* ---------- scene ---------- */
  const canvas = document.getElementById("scene");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  camera.position.z = 8;

  const SUN = new THREE.Vector3(-0.5, 0.45, 0.75).normalize();
  scene.add(new THREE.AmbientLight(0x223355, 0.3));
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
  sunLight.position.copy(SUN).multiplyScalar(10);
  scene.add(sunLight);

  /* ---------- tekstur cadangan (dipakai kalau file di tex/ belum ada) ---------- */
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return hash(xi, yi) * (1 - u) * (1 - v) + hash(xi + 1, yi) * u * (1 - v) +
           hash(xi, yi + 1) * (1 - u) * v + hash(xi + 1, yi + 1) * u * v;
  };
  const fbm = (u, v, seed) => {
    let sum = 0, amp = 0.5, f = 4;
    for (let o = 0; o < 5; o++) {
      const a = vnoise(u * f + seed, v * f + seed), b = vnoise((u - 1) * f + seed, v * f + seed);
      sum += (a * (1 - u) + b * u) * amp; amp *= 0.5; f *= 2;
    }
    return sum;
  };
  const paint = (w, h, fn) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), im = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) im.data.set(fn(x / w, y / h), (y * w + x) * 4);
    g.putImageData(im, 0, 0);
    return new THREE.CanvasTexture(c);
  };
  const makeDay = () => paint(1024, 512, (u, v) => {
    const n = fbm(u, v, 3.1), pole = Math.abs(v - 0.5) * 2;
    if (pole > 0.9 + (n - 0.5) * 0.2) return [228, 240, 250, 255];
    if (n > 0.5) { const t = Math.min((n - 0.5) * 4, 1); return [34 + t * 100, 84 + t * 50, 66 + t * 30, 255]; }
    const t = n / 0.5; return [5 + t * 10, 26 + t * 52, 58 + t * 72, 255];
  });
  const makeNight = () => paint(2, 2, () => [0, 0, 0, 255]);
  const makeClouds = () => paint(512, 256, (u, v) => {
    const a = Math.min(Math.max((fbm(u, v, 9.7) - 0.5) * 3, 0), 1) * 255; return [a, a, a, 255];
  });

  const loader = new THREE.TextureLoader();
  const tryLoad = (path, fallback) => new Promise((resolve) =>
    loader.load(path, resolve, undefined, () => resolve(fallback())));

  Promise.all([
    tryLoad("tex/earth_day.jpg", makeDay),
    tryLoad("tex/earth_night.jpg", makeNight),
    tryLoad("tex/earth_clouds.jpg", makeClouds),
    tryLoad("tex/star_milky.jpg", () => null),
  ]).then(([dayTex, nightTex, cloudTex, milkyTex]) => build(dayTex, nightTex, cloudTex, milkyTex));

  function build(dayTex, nightTex, cloudTex, milkyTex) {
    const pivot = new THREE.Group();   // posisi + ukuran
    const tilt = new THREE.Group();    // menghadapkan lintang tertentu ke kamera
    const earth = new THREE.Group();   // putaran (bujur)
    tilt.rotation.z = 0.15;
    pivot.add(tilt); tilt.add(earth); scene.add(pivot);

    // permukaan: peta siang, lampu kota di sisi malam, senja jingga di terminator
    earth.add(new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 96),
      new THREE.ShaderMaterial({
        uniforms: { day: { value: dayTex }, night: { value: nightTex }, sun: { value: SUN } },
        vertexShader: `varying vec2 vUv; varying vec3 vN;
          void main(){ vUv = uv; vN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform sampler2D day; uniform sampler2D night; uniform vec3 sun;
          varying vec2 vUv; varying vec3 vN;
          void main(){
            float k = dot(normalize(vN), sun);
            vec3 d = texture2D(day, vUv).rgb, n = texture2D(night, vUv).rgb;
            float dusk = smoothstep(-0.12, 0.3, k);
            float tw = exp(-pow(k * 4.5, 2.0));
            vec3 col = d * (0.025 + max(k, 0.0) * 1.2) + d * vec3(1.0, 0.5, 0.22) * tw * 0.45 + n * (1.0 - dusk) * 1.8;
            float rim = pow(1.0 - max(dot(normalize(vN), vec3(0.0, 0.0, 1.0)), 0.0), 4.0);
            col += vec3(0.35, 0.6, 1.0) * rim * 0.14 * smoothstep(-0.2, 0.5, k);
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    ));

    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.01, 96, 96),
      new THREE.MeshLambertMaterial({ map: cloudTex, alphaMap: cloudTex, transparent: true, opacity: 0.5, depthWrite: false })
    );
    earth.add(clouds);

    // atmosfer: kabut biru lebar dan lembut, dihitung dari jarak sinar pandang ke pusat planet
    const atmo = new THREE.ShaderMaterial({
      uniforms: { sun: { value: SUN }, uCenter: { value: new THREE.Vector3(0, 0, -8) }, uR: { value: 3 } },
      transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: `varying vec3 vP; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 sun; uniform vec3 uCenter; uniform float uR; varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          vec3 q = d * dot(uCenter, d);                 // titik terdekat sinar ke pusat planet
          float b = length(q - uCenter);                // jarak sinar dari pusat planet
          if (b < uR) discard;
          float h = clamp(1.0 - (b - uR) / (uR * 0.36), 0.0, 1.0);
          float soft = pow(h, 2.6);
          float s = dot(normalize(q - uCenter), sun);   // sisi planet yang disinari matahari
          float lit = 0.2 + 0.8 * smoothstep(-0.55, 0.55, s);
          float band = exp(-pow(s * 3.0, 2.0));
          vec3 col = mix(vec3(0.14, 0.34, 0.9), vec3(0.42, 0.7, 1.0), pow(h, 4.0));
          col = mix(col, vec3(1.0, 0.55, 0.3), band * 0.18);
          gl_FragColor = vec4(col * soft * lit * 0.9, 1.0);
        }`,
    });
    pivot.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 64, 64), atmo));
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { uGlow: { value: new THREE.Color(0x3a6cff) }, uIntensity: { value: 0.22 } },
        transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uGlow; uniform float uIntensity; varying vec2 vUv;
          void main(){ float d = length(vUv - 0.5) * 2.0;
            float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.2);
            gl_FragColor = vec4(uGlow * a * uIntensity, a); }`,
      })
    );
    halo.scale.setScalar(3.3);
    pivot.add(halo);

    // penanda kota berdenyut (cincin hijau mint); Surakarta dibuat lebih besar
    const cities = [
      [-7.56, 110.82, 1.2], [-6.21, 106.85, 1], [-7.25, 112.75, 1], [1.35, 103.82, 1], [13.75, 100.5, 1],
      [14.6, 121.0, 1], [35.7, 139.7, 1], [28.6, 77.2, 1], [-33.9, 151.2, 1], [30.0, 31.2, 1],
      [51.5, -0.1, 1], [40.7, -74.0, 1],
    ];
    const ll2v = (lat, lon, r) => {
      const phi = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180;
      return [-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th)];
    };
    const mPos = new Float32Array(cities.length * 3), mSeed = new Float32Array(cities.length), mScale = new Float32Array(cities.length);
    cities.forEach(([la, lo, sc], i) => { mPos.set(ll2v(la, lo, 1.012), i * 3); mSeed[i] = Math.random(); mScale[i] = sc; });
    const mGeo = new THREE.BufferGeometry();
    mGeo.setAttribute("position", new THREE.BufferAttribute(mPos, 3));
    mGeo.setAttribute("seed", new THREE.BufferAttribute(mSeed, 1));
    mGeo.setAttribute("scale", new THREE.BufferAttribute(mScale, 1));
    const mMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0.3 }, uColor: { value: new THREE.Color(0x8fe9c8) },
                  uSize: { value: 26 }, uSpeed: { value: 0.35 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; attribute float scale; uniform float uSize; uniform vec2 uRes;
        varying float vSeed; varying float vFade;
        void main(){
          vSeed = seed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 vn = normalize(normalMatrix * normalize(position));
          vec3 vd = normalize(-mv.xyz);
          vFade = smoothstep(0.15, 0.5, dot(vn, vd));
          gl_PointSize = max(uSize * scale * uRes.y / 900.0 * (7.0 / max(-mv.z, 1.0)), 2.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uSpeed; uniform float uAmt;
        varying float vSeed; varying float vFade;
        void main(){
          if (vFade <= 0.001) discard;
          vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0;
          if (d > 1.0) discard;
          float core = smoothstep(0.16, 0.0, d);
          float ph = fract(uTime * uSpeed + vSeed);
          float ring = smoothstep(0.09, 0.0, abs(d - (0.25 + ph * 0.75))) * (1.0 - ph);
          gl_FragColor = vec4(uColor, clamp(core + ring, 0.0, 1.0) * vFade * uAmt);
        }`,
    });
    earth.add(new THREE.Points(mGeo, mMat));

    // titik emas: Klaten, Jawa Tengah
    const KLATEN = new THREE.Vector3(...ll2v(-7.7056, 110.6006, 1.012));
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(KLATEN.toArray()), 3));
    gGeo.setAttribute("seed", new THREE.BufferAttribute(new Float32Array([0.3]), 1));
    gGeo.setAttribute("scale", new THREE.BufferAttribute(new Float32Array([1]), 1));
    const gMat = mMat.clone();
    gMat.uniforms.uColor.value = new THREE.Color(0xffd27a);
    gMat.uniforms.uSize.value = 17;
    gMat.uniforms.uSpeed.value = 0.5;
    earth.add(new THREE.Points(gGeo, gMat));
    const markMats = [mMat, gMat];
    const pin = document.getElementById("pin");
    const tmp = new THREE.Vector3();

    // bintang + latar Bima Sakti
    const N = 1400, sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      sp.set([90 * s * Math.cos(th), 90 * u, 90 * s * Math.sin(th)], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 0.3, transparent: true, opacity: 0.8 }));
    scene.add(stars);
    let milky = null;
    if (milkyTex) {
      milky = new THREE.Mesh(
        new THREE.SphereGeometry(150, 48, 48),
        new THREE.MeshBasicMaterial({ map: milkyTex, side: THREE.BackSide, color: 0x555a68, depthWrite: false })
      );
      scene.add(milky);
    }

    /* ---------- cerita gulir: satu "pemberhentian" per bagian ---------- */
    // x/y/s = posisi & ukuran bumi, lon/lat = titik yang dihadapkan ke kamera, sun = arah matahari
    const ST = [
      { x: 0,    y: -6.0, s: 2.5,  lon: -80, lat: 50,  sun: [-0.5, 0.45, 0.75] },   // hero
      { x: -2.9, y: -0.2, s: 1.6,  lon: 175, lat: -12, sun: [-0.4, 0.3, 0.85] },    // 01 planet
      { x: 2.7,  y: 0.0,  s: 1.5,  lon: 20,  lat: 10,  sun: [0.8, 0.2, 0.4] },      // 02 siang & malam
      { x: -2.8, y: 0.1,  s: 1.5,  lon: 108, lat: -5,  sun: [0.75, 0.15, -0.35] },  // 03 lampu kota
      { x: 2.7,  y: 0.1,  s: 1.5,  lon: 15,  lat: 30,  sun: [0.8, 0.25, -0.05] },   // 04 atmosfer
      { x: 0,    y: -0.2, s: 1.35, lon: 100, lat: 20,  sun: [-0.3, 0.3, 0.9] },     // 05 pembuat
      { x: 0,    y: -6.0, s: 2.4,  lon: -60, lat: 55,  sun: [-0.4, 0.4, 0.8] },     // penutup
    ];
    const LAST = ST.length - 1;
    const col = (key) => ST.map((o) => o[key]);
    const A = { x: col("x"), y: col("y"), s: col("s"), lat: col("lat"),
                sx: ST.map((o) => o.sun[0]), sy: ST.map((o) => o.sun[1]), sz: ST.map((o) => o.sun[2]) };
    // sudut putar dibuat terus searah (tidak balik arah) supaya terasa berputar mengikuti gulir
    const theta = [];
    ST.forEach((o, i) => {
      let t = -(90 + o.lon) * Math.PI / 180;
      if (i > 0) while (t > theta[i - 1]) t -= Math.PI * 2;
      theta.push(t);
    });
    A.th = theta;

    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const S = (arr, f) => {
      const i = Math.min(Math.floor(f), arr.length - 2), t = f - i, e = t * t * (3 - 2 * t);
      return arr[i] + (arr[i + 1] - arr[i]) * e;
    };

    const stops = [...document.querySelectorAll("[data-stop]")];
    let anchors = [];
    const calcAnchors = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      anchors = stops.map((el) => {
        const r = el.getBoundingClientRect();
        return clamp(r.top + scrollY + r.height / 2 - innerHeight / 2, 0, Math.max(max, 1));
      });
      anchors[0] = 0; anchors[LAST] = Math.max(max, 1);
      for (let i = 1; i <= LAST; i++) if (anchors[i] <= anchors[i - 1]) anchors[i] = anchors[i - 1] + 1;
    };
    const indexAt = (y) => {
      if (y <= anchors[0]) return 0;
      for (let i = 1; i <= LAST; i++) if (y <= anchors[i]) return i - 1 + (y - anchors[i - 1]) / (anchors[i] - anchors[i - 1]);
      return LAST;
    };

    let wide = true;
    const resize = () => {
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      wide = camera.aspect > 1.05;
      markMats.forEach((m) => m.uniforms.uRes.value.set(innerWidth, innerHeight));
      calcAnchors();
    };
    addEventListener("resize", resize);
    addEventListener("load", calcAnchors);
    resize();

    let cur = 0, entryT = 0;
    const clock = new THREE.Clock();

    const frame = () => {
      const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
      cur += (indexAt(scrollY) - cur) * Math.min(1, dt * 4.5);
      const f = clamp(cur, 0, LAST);

      const side = clamp(innerWidth / 1300, 0.55, 1);
      const x = wide ? S(A.x, f) * side : 0;
      const mid = Math.abs(S(A.y, f)) < 3;
      const y = S(A.y, f) + (!wide && mid ? 0.9 : 0);

      // bumi naik dari bawah satu kali saat pertama dibuka
      entryT += dt;
      const e = reduce ? 1 : Math.min(entryT / 2.0, 1), ease = 1 - Math.pow(1 - e, 3);
      pivot.position.set(x, y + (1 - ease) * -6.5, 0);
      pivot.scale.setScalar(1.95 * S(A.s, f) * (wide ? 1 : 0.72));

      earth.rotation.y = S(A.th, f) + Math.sin(time * 0.25) * 0.05;
      tilt.rotation.x = S(A.lat, f) * Math.PI / 180;
      clouds.rotation.y += dt * 0.05;

      // matahari bergerak: siang -> senja -> malam
      SUN.set(S(A.sx, f), S(A.sy, f), S(A.sz, f)).normalize();
      sunLight.position.copy(SUN).multiplyScalar(10);

      // penanda kota paling jelas di bagian "City Lights"
      const near = 1 - clamp(Math.abs(f - 3), 0, 1);
      const nearE = near * near * (3 - 2 * near);
      markMats.forEach((m) => { m.uniforms.uAmt.value = 0.25 + 0.75 * nearE; m.uniforms.uTime.value += dt; });
      atmo.uniforms.uCenter.value.set(pivot.position.x, pivot.position.y, -camera.position.z);
      atmo.uniforms.uR.value = pivot.scale.x;

      // label "Klaten, Central Java" mengikuti titik emas di layar
      earth.updateWorldMatrix(true, false);
      tmp.copy(KLATEN); earth.localToWorld(tmp);
      const nrm = tmp.clone().sub(pivot.position).normalize();
      const toCam = camera.position.clone().sub(tmp).normalize();
      const facing = clamp((nrm.dot(toCam) - 0.2) / 0.3, 0, 1);
      tmp.project(camera);
      pin.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * innerWidth}px, ${(-tmp.y * 0.5 + 0.5) * innerHeight}px)`;
      pin.style.opacity = (facing * nearE).toFixed(3);

      stars.rotation.y = f * 0.08;
      if (milky) { milky.rotation.y = f * 0.12; milky.rotation.x = f * 0.02; }

      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
})();