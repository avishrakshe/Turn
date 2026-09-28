// The 3D stage for the landing film: a committee's table at night. Six member tokens sit on a
// ring, gold coins fly between their seats, the stacks held for them and the pot, the reserve
// glows around the pot, and a marigold marker shows whose turn it is. Everything is drawn from
// the film's data at film time t: this module keeps no story state of its own.
//
// Loaded on demand (it pulls in three.js), so the page's first paint never waits for it.

import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  FogExp2,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Scene,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { type Film, ledger, MEMBERS, POT, RESERVE, SEATS } from "./timeline";

export const NIGHT = "#120d0a";

// Table layout, in scene units (about a metre each).
const RING = 3.2; // member tokens
const HELD_RING = 2.05; // stacks held for each member
const RESERVE_RING = 0.62; // the reserve, around the pot
const TOKEN_R = 0.5;
const TOKEN_H = 0.16;
const TABLE_R = 4.3;
/** Every shot's distance is scaled by this, so the whole table fits between the HUD and the captions. */
const FRAME = 1.3;
const COIN_R = 0.25;
const COIN_H = 0.06;
const STEP = 0.066; // stack spacing
const PLINTH = 0.04;
const MAX_COINS = 160;
const MAX_MOTES = 24;

export interface SceneOptions {
  reducedMotion: boolean;
  fonts: { sans: string; display: string; mono: string };
  colors: { avatars: string[]; marigold: string; teal: string; ink: string; cream: string };
}

export interface LabelAnchor {
  x: number;
  y: number;
  /** 0 hidden … 1 fully shown (joined, and in front of the camera). */
  alpha: number;
  /** 1 at the default distance; smaller when further away. */
  scale: number;
}

export interface FilmScene {
  render(t: number, shake: number, now: number): void;
  anchors(out: LabelAnchor[]): void;
  resize(): void;
  dispose(): void;
}

// --- easing ---------------------------------------------------------------------------------------

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
const easeOutBack = (u: number) => {
  const c = 1.5;
  return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2;
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
// Cheap smooth noise for the camera shake.
const noise = (x: number) => Math.sin(x) * 0.6 + Math.sin(x * 2.3 + 1.7) * 0.3 + Math.sin(x * 4.1 + 0.3) * 0.1;

const angleOf = (seat: number) => (seat / SEATS) * Math.PI * 2;
/** Seat 0 at twelve o'clock (far side), going clockwise when seen from above. */
const onRing = (r: number, a: number, y = 0, out = new Vector3()) => out.set(r * Math.sin(a), y, -r * Math.cos(a));

// --- camera shots ---------------------------------------------------------------------------------

interface Shot {
  at: number;
  az: number; // degrees around the table; 0 = front
  el: number; // degrees above the table
  dist: number;
  target: [number, number, number];
  fov: number;
}

function buildShots(film: Film): Shot[] {
  const at = (phase: string, month: number, k = 0) => {
    const b = film.beats.find((x) => x.phase === phase && x.month === month);
    return b ? b.t0 + (b.t1 - b.t0) * k : 0;
  };
  const shot = (t: number, az: number, el: number, dist: number, target: [number, number, number] = [0, 0.3, 0], fov = 34): Shot => ({ at: t, az, el, dist, target, fov });
  const last = film.months;
  return [
    shot(0, 0, 88, 16, [0, 0, -0.6], 32),
    shot(at("join", 0, 0.3), 0, 82, 13.5, [0, 0, 0], 32),
    shot(at("join", 0, 1), 12, 50, 11.5, [0, 0.2, 0]),
    shot(at("collect", 1, 0.5), 18, 36, 10.2, [0, 0.4, 0]),
    shot(at("bids", 1, 0.4), -28, 28, 8.8, [-1, 0.9, 1.1]),
    shot(at("reveal", 1, 0.7), -46, 24, 7.8, [-1.4, 0.9, 0.8]),
    shot(at("payout", 1, 0.1), -18, 20, 8.2, [0, 0.6, 0]),
    shot(at("payout", 1, 0.9), 8, 30, 9.8, [0, 0.3, 0]),
    shot(at("collect", 2, 0.6), 42, 40, 10.6),
    shot(at("reveal", 2, 0.7), 72, 30, 9, [1.2, 0.7, -0.4]),
    shot(at("payout", 2, 1), 84, 36, 10),
    shot(at("reveal", 3, 0.7), 58, 32, 9, [1.2, 0.6, 0.6]),
    shot(at("payout", 3, 1), 80, 38, 10.5),
    shot(at("collect", 4, 0.35), 116, 24, 7.4, [1.6, 0.6, -0.9]),
    shot(at("collect", 4, 1), 104, 30, 8.2, [1.2, 0.5, -0.6]),
    shot(at("payout", 4, 0.8), 150, 34, 10, [0, 0.5, -0.8]),
    shot(at("reveal", 5, 0.7), 196, 36, 10.5),
    shot(at("reveal", last, 0.7), 248, 34, 9.6, [-1, 0.5, -0.6]),
    shot(at("complete", last + 1, 0.6), 300, 50, 12),
    // Pulled back and aimed a little below centre, so the mark sits clear of the caption.
    shot(at("outro", last + 1, 0.55), 360, 88, 17.5, [0, 0, 1.1], 32),
  ];
}

function cameraAt(shots: Shot[], t: number) {
  let i = 0;
  while (i < shots.length - 2 && t > shots[i + 1]!.at) i++;
  const a = shots[i]!;
  const b = shots[i + 1]!;
  const k = easeInOut(clamp01((t - a.at) / Math.max(1e-6, b.at - a.at)));
  return {
    az: lerp(a.az, b.az, k),
    el: lerp(a.el, b.el, k),
    dist: lerp(a.dist, b.dist, k) * FRAME,
    tx: lerp(a.target[0], b.target[0], k),
    ty: lerp(a.target[1], b.target[1], k),
    tz: lerp(a.target[2], b.target[2], k),
    fov: lerp(a.fov, b.fov, k),
  };
}

// --- textures -------------------------------------------------------------------------------------

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function initialsOf(name: string) {
  const parts = name.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

// --- the scene ------------------------------------------------------------------------------------

export function createFilmScene(canvas: HTMLCanvasElement, film: Film, opts: SceneOptions): FilmScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.background = new Color(NIGHT);
  scene.fog = new FogExp2(NIGHT, 0.045);
  // A soft studio environment so the gold coins have something to reflect.
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const env = pmrem.fromScene(envScene, 0.04);
  envScene.dispose();
  scene.environment = env.texture;
  scene.environmentIntensity = 0.5;

  const camera = new PerspectiveCamera(34, 1, 0.1, 80);
  const disposables: Array<{ dispose(): void }> = [pmrem, env];
  const own = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // Light: a warm lamp over the table, a cool rim from behind, and the marker's own glow.
  scene.add(new HemisphereLight(0xffe6c4, 0x140c07, 0.55));
  const lamp = new SpotLight(0xffd29a, 260, 0, 0.62, 0.8, 2);
  lamp.position.set(0.8, 9.5, 2.6);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0005;
  lamp.shadow.radius = 5;
  lamp.shadow.camera.near = 4;
  lamp.shadow.camera.far = 16;
  scene.add(lamp, lamp.target);
  const rim = new DirectionalLight(0x6fcbbc, 0.5);
  rim.position.set(-6, 3.5, -7);
  scene.add(rim);
  const markerLight = new PointLight(opts.colors.marigold, 0, 4, 1.6);
  scene.add(markerLight);

  // The table: a warm dark floor, a dotted track like the brand ring, and a plinth for the pot.
  const floor = new Mesh(own(new CircleGeometry(40, 96)), own(new MeshStandardMaterial({ color: 0x140e0a, roughness: 0.95, metalness: 0 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.09;
  floor.receiveShadow = true;
  scene.add(floor);
  // The family's round table, lit by the lamp.
  const table = new Mesh(own(new CylinderGeometry(TABLE_R, TABLE_R - 0.05, 0.09, 128)), own(new MeshStandardMaterial({ color: 0x3a2818, roughness: 0.62, metalness: 0.08 })));
  table.position.y = -0.045;
  table.receiveShadow = true;
  scene.add(table);

  const DOTS = 96;
  const dots = new InstancedMesh(
    own(new CylinderGeometry(0.03, 0.03, 0.01, 10)),
    own(new MeshStandardMaterial({ color: 0x8f8071, emissive: new Color(opts.colors.marigold), emissiveIntensity: 0.08, roughness: 0.6 })),
    DOTS,
  );
  const tmp = new Object3D();
  for (let k = 0; k < DOTS; k++) {
    onRing(RING, (k / DOTS) * Math.PI * 2, 0.005, tmp.position);
    tmp.updateMatrix();
    dots.setMatrixAt(k, tmp.matrix);
  }
  scene.add(dots);

  // The Turn mark's ring, faded in at the end.
  const trackMat = own(new MeshBasicMaterial({ color: opts.colors.teal, transparent: true, opacity: 0, depthWrite: false }));
  const track = new Mesh(own(new TorusGeometry(RING, 0.05, 8, 160)), trackMat);
  track.rotation.x = Math.PI / 2;
  track.position.y = 0.01;
  scene.add(track);

  const plinthMat = own(new MeshStandardMaterial({ color: 0x2a211a, roughness: 0.35, metalness: 0.6, transparent: true }));
  const plinth = new Mesh(own(new CylinderGeometry(0.42, 0.46, PLINTH, 48)), plinthMat);
  plinth.position.y = PLINTH / 2;
  plinth.receiveShadow = true;
  scene.add(plinth);

  // The reserve: a ring of light around the pot that brightens as it fills.
  const reserveMat = own(new MeshStandardMaterial({ color: 0x173430, emissive: new Color(opts.colors.teal), emissiveIntensity: 0.2, roughness: 0.4, transparent: true }));
  const reserve = new Mesh(own(new TorusGeometry(RESERVE_RING, 0.022, 12, 120)), reserveMat);
  reserve.rotation.x = Math.PI / 2;
  reserve.position.y = 0.03;
  scene.add(reserve);
  const reserveGlowMat = own(new MeshBasicMaterial({ color: opts.colors.teal, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  const reserveGlow = new Mesh(own(new TorusGeometry(RESERVE_RING, 0.09, 12, 120)), reserveGlowMat);
  reserveGlow.rotation.x = Math.PI / 2;
  reserveGlow.position.y = 0.03;
  scene.add(reserveGlow);

  // Member tokens: a thick disc in the member's colour with their initials on top.
  const tokenGeo = own(new CylinderGeometry(TOKEN_R, TOKEN_R, TOKEN_H, 64));
  const tokenCoverGeo = own(new CircleGeometry(TOKEN_R, 64));
  const AMBER = new Color("#d9822b");
  const MARIGOLD = new Color(opts.colors.marigold);
  const tokens = MEMBERS.map((m, i) => {
    const color = new Color(opts.colors.avatars[i % opts.colors.avatars.length]);
    const side = own(new MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05, emissive: new Color(opts.colors.marigold), emissiveIntensity: 0 }));
    const top = own(
      new MeshStandardMaterial({
        roughness: 0.5,
        emissive: new Color(opts.colors.marigold),
        emissiveIntensity: 0,
        map: own(
          canvasTexture(256, (ctx, s) => {
            ctx.fillStyle = opts.colors.avatars[i % opts.colors.avatars.length]!;
            ctx.fillRect(0, 0, s, s);
            ctx.fillStyle = opts.colors.ink;
            ctx.font = `600 ${s * 0.34}px ${opts.fonts.sans}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            // The top face's texture is seen from above with twelve o'clock at the top.
            ctx.fillText(initialsOf(m.name), s / 2, s / 2 + s * 0.02);
          }),
        ),
      }),
    );
    const mesh = new Mesh(tokenGeo, [side, top, side]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const home = onRing(RING, angleOf(i), TOKEN_H / 2);
    mesh.position.copy(home);
    // At the end the ring becomes the Turn mark: this disc fades in over the initials.
    const markColor = new Color(i === 1 ? opts.colors.marigold : opts.colors.teal);
    const cover = new Mesh(tokenCoverGeo, own(new MeshBasicMaterial({ color: markColor, transparent: true, opacity: 0, toneMapped: false })));
    cover.rotation.x = -Math.PI / 2;
    cover.position.y = TOKEN_H / 2 + 0.002;
    mesh.add(cover);
    scene.add(mesh);
    return { mesh, side, top, cover, home, base: color, markColor };
  });

  // Held stacks get a glass sleeve in teal: this money is locked for that member.
  const sleeveMat = own(new MeshStandardMaterial({ color: opts.colors.teal, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0, depthWrite: false }));
  const sleeveGeo = own(new CylinderGeometry(COIN_R + 0.07, COIN_R + 0.07, 1, 40, 1, true));
  const baseGeo = own(new TorusGeometry(COIN_R + 0.1, 0.012, 8, 48));
  const baseMat = own(new MeshStandardMaterial({ color: 0x173430, emissive: new Color(opts.colors.teal), emissiveIntensity: 0.5, transparent: true }));
  const sleeves = Array.from({ length: SEATS }, (_, i) => {
    const at = onRing(HELD_RING, angleOf(i));
    const sleeve = new Mesh(sleeveGeo, sleeveMat);
    sleeve.position.copy(at);
    const ring = new Mesh(baseGeo, baseMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(at.x, 0.01, at.z);
    scene.add(sleeve, ring);
    return { sleeve, ring };
  });

  // Coins, one instanced mesh for all of them.
  const coinGeo = own(new CylinderGeometry(COIN_R, COIN_R, COIN_H, 40));
  const coinMat = own(new MeshStandardMaterial({ color: 0xf0b44a, metalness: 1, roughness: 0.3 }));
  const coinMesh = new InstancedMesh(coinGeo, coinMat, MAX_COINS);
  coinMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  coinMesh.castShadow = true;
  coinMesh.receiveShadow = true;
  coinMesh.frustumCulled = false;
  scene.add(coinMesh);

  // Motes: sparks of value (discount credit, reserve shares) with a soft halo.
  const moteMesh = new InstancedMesh(own(new SphereGeometry(0.05, 12, 8)), own(new MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false })), MAX_MOTES);
  const haloMesh = new InstancedMesh(
    own(new SphereGeometry(0.16, 12, 8)),
    own(new MeshBasicMaterial({ color: opts.colors.marigold, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false })),
    MAX_MOTES,
  );
  for (const m of [moteMesh, haloMesh]) {
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.frustumCulled = false;
    scene.add(m);
  }

  // The marker: a marigold ring on the table around whoever's turn it is.
  const markerMat = own(new MeshBasicMaterial({ color: opts.colors.marigold, toneMapped: false, transparent: true }));
  const marker = new Mesh(own(new TorusGeometry(TOKEN_R + 0.2, 0.045, 12, 96)), markerMat);
  marker.rotation.x = Math.PI / 2;
  scene.add(marker);
  const markerGlowMat = own(new MeshBasicMaterial({ color: opts.colors.marigold, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }));
  const markerGlow = new Mesh(own(new TorusGeometry(TOKEN_R + 0.2, 0.16, 12, 96)), markerGlowMat);
  markerGlow.rotation.x = Math.PI / 2;
  scene.add(markerGlow);
  const missMat = own(new MeshBasicMaterial({ color: 0xf2994a, toneMapped: false, transparent: true, depthWrite: false }));
  const missRing = new Mesh(own(new TorusGeometry(TOKEN_R + 0.14, 0.03, 10, 96)), missMat);
  missRing.rotation.x = Math.PI / 2;
  scene.add(missRing);

  // Sealed bids: a card with a wax seal on the front and the discount on the back.
  const cardGeo = own(new BoxGeometry(0.62, 0.42, 0.02));
  const edgeMat = own(new MeshStandardMaterial({ color: opts.colors.cream, roughness: 0.7 }));
  const bidCards = film.bids.map((b) => {
    const front = own(
      new MeshStandardMaterial({
        roughness: 0.65,
        map: own(
          canvasTexture(256, (ctx, s) => {
            ctx.fillStyle = opts.colors.cream;
            ctx.fillRect(0, 0, s, s);
            ctx.strokeStyle = "rgba(43,33,26,0.18)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(s / 2, s * 0.55);
            ctx.lineTo(s, 0);
            ctx.stroke();
            ctx.fillStyle = opts.colors.marigold;
            ctx.beginPath();
            ctx.arc(s / 2, s * 0.55, s * 0.13, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#6b4208";
            ctx.fillRect(s / 2 - s * 0.045, s * 0.54, s * 0.09, s * 0.07);
            ctx.strokeStyle = "#6b4208";
            ctx.lineWidth = s * 0.018;
            ctx.beginPath();
            ctx.arc(s / 2, s * 0.54, s * 0.03, Math.PI, 0);
            ctx.stroke();
            ctx.fillStyle = "rgba(43,33,26,0.7)";
            ctx.font = `600 ${s * 0.07}px ${opts.fonts.mono}`;
            ctx.textAlign = "center";
            ctx.fillText("SEALED BID", s / 2, s * 0.86);
          }),
        ),
      }),
    );
    front.map!.repeat.set(1, 0.42 / 0.62);
    front.map!.offset.set(0, (1 - 0.42 / 0.62) / 2);
    const back = own(
      new MeshStandardMaterial({
        roughness: 0.65,
        map: own(
          canvasTexture(256, (ctx, s) => {
            ctx.fillStyle = opts.colors.cream;
            ctx.fillRect(0, 0, s, s);
            ctx.fillStyle = opts.colors.ink;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `600 ${s * 0.22}px ${opts.fonts.display}`;
            ctx.fillText(`${b.bps / 100}%`, s / 2, s * 0.47);
            ctx.font = `600 ${s * 0.065}px ${opts.fonts.mono}`;
            ctx.fillStyle = "rgba(43,33,26,0.7)";
            ctx.fillText(`${MEMBERS[b.member]!.name.split(" ")[0]!.toUpperCase()} · DISCOUNT`, s / 2, s * 0.7);
          }),
        ),
      }),
    );
    back.map!.repeat.set(1, 0.42 / 0.62);
    back.map!.offset.set(0, (1 - 0.42 / 0.62) / 2);
    const mesh = new Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, front, back]);
    mesh.castShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, bid: b };
  });

  // --- positions ---------------------------------------------------------------------------------

  const potLift = (t: number) => {
    for (const b of film.beats) {
      if (b.phase !== "payout" || t < b.t0 || t > b.t1) continue;
      const u = (t - b.t0) / (b.t1 - b.t0);
      return smooth(0, 0.14, u) * (1 - smooth(0.82, 1, u)) * 0.42;
    }
    return 0;
  };

  const tmpA = new Vector3();
  const tmpB = new Vector3();
  const tmpC = new Vector3();

  /** Where a coin sits at a node: on a stack slot, on top of a seat's token, or on the reserve ring. */
  function nodePoint(node: number, slot: number, lift: number, toward: Vector3 | null, out: Vector3) {
    if (node < SEATS) {
      const tok = tokens[node]!;
      return out.set(tok.home.x, TOKEN_H + COIN_H / 2 + 0.02, tok.home.z);
    }
    if (node === RESERVE) {
      // The point on the ring facing where the coin comes from or goes to.
      const a = toward ? Math.atan2(toward.x, -toward.z) : 0;
      return onRing(RESERVE_RING, a, 0.05, out);
    }
    const y = PLINTH * (node === POT ? 1 : 0) + COIN_H / 2 + slot * STEP + (node === POT ? lift : 0);
    if (node === POT) return out.set(0, y, 0);
    return onRing(HELD_RING, angleOf(node - SEATS), y, out);
  }

  const shots = buildShots(film);
  const up = new Vector3(0, 1, 0);
  const axis = new Vector3(1, 0, 0);
  const seatTmp = new Vector3();
  let lastT = 0;

  function render(t: number, shake: number, now: number) {
    const lift = potLift(t);
    const { count, value } = ledger(film.flights, t);

    // Camera.
    const c = cameraAt(shots, t);
    const az = (c.az * Math.PI) / 180;
    const el = (c.el * Math.PI) / 180;
    camera.fov = c.fov;
    // Narrow screens pull back to fit the table's width; seen from straight above the table is
    // round, so less pull-back is needed.
    const fit = Math.max(0.4, Math.min(1, camera.aspect / 1.15));
    camera.zoom = fit + (Math.min(1, fit * 1.7) - fit) * smooth(55, 85, c.el);
    camera.position.set(c.tx + c.dist * Math.cos(el) * Math.sin(az), c.ty + c.dist * Math.sin(el), c.tz + c.dist * Math.cos(el) * Math.cos(az));
    const s = opts.reducedMotion ? 0 : shake;
    if (s > 0.001) {
      camera.position.x += noise(now * 0.031) * 0.09 * s;
      camera.position.y += noise(now * 0.037 + 2) * 0.07 * s;
      camera.position.z += noise(now * 0.029 + 5) * 0.09 * s;
    }
    camera.up.copy(up);
    camera.lookAt(c.tx, c.ty, c.tz);
    if (s > 0.001) camera.rotateZ(noise(now * 0.023 + 9) * 0.006 * s);
    camera.updateProjectionMatrix();

    // Tokens pop in as members join, glow on their turn, pulse amber when they miss.
    const turn = markerAt(t);
    const done = film.beats.find((b) => b.phase === "complete");
    const celebrate = done ? smooth(done.t0, done.t0 + 1, t) * (1 - smooth(done.t1 + 1.5, done.t1 + 2.5, t)) : 0;
    const outro = film.beats.find((b) => b.phase === "outro");
    const logo = outro ? smooth(outro.t0 + 0.6, outro.t0 + 2, t) : 0;
    tokens.forEach((tok, i) => {
      const k = Math.max(0.001, easeOutBack(clamp01((t - film.joins[i]!) / 0.45)));
      tok.mesh.visible = k > 0.002;
      // Tokens are round, so turning them changes only which way the initials face: always
      // upright for the camera.
      tok.mesh.rotation.y = az + Math.PI / 2;
      // The Turn mark's lit seat is bigger than the others.
      const size = k * (1 + logo * (i === 1 ? 0.2 : -0.28));
      tok.mesh.scale.set(size, k, size);
      let glow = turn && turn.seat === i ? 0.35 * turn.strength : 0;
      glow = Math.max(glow, celebrate * (0.18 + 0.1 * Math.sin(now * 0.004 + i)));
      let amber = 0;
      for (const m of film.misses) if (m.member === i && t > m.t0 && t < m.t1 + 0.6) amber = Math.max(amber, smooth(m.t0, m.t0 + 0.3, t) * (1 - smooth(m.t1, m.t1 + 0.6, t)));
      tok.side.emissiveIntensity = glow + amber * (0.45 + 0.25 * Math.sin(now * 0.012));
      tok.top.emissiveIntensity = glow * 0.5 + amber * 0.3;
      tok.side.emissive.copy(amber > glow ? AMBER : MARIGOLD);
      tok.top.emissive.copy(amber > glow ? AMBER : MARIGOLD);
      // At the end the ring becomes the Turn mark: teal seats, one marigold.
      tok.side.color.copy(tok.base).lerp(tok.markColor, logo);
      (tok.cover.material as MeshBasicMaterial).opacity = logo;
    });
    trackMat.opacity = logo * 0.35;
    baseMat.opacity = 1 - logo;
    plinthMat.opacity = 1 - logo;
    plinth.visible = logo < 0.99;

    // Stacks.
    let n = 0;
    const put = (x: number, y: number, z: number, spin = 0) => {
      if (n >= MAX_COINS) return;
      tmp.position.set(x, y, z);
      tmp.quaternion.setFromAxisAngle(axis, spin);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      coinMesh.setMatrixAt(n++, tmp.matrix);
    };
    for (let node = SEATS; node <= POT; node++) {
      for (let k = 0; k < count[node]!; k++) {
        nodePoint(node, k, lift, null, tmpA);
        // A little irregularity so stacks look hand-placed.
        const j = Math.sin(node * 12.9 + k * 78.2) * 0.012;
        axis.set(1, 0, 0);
        put(tmpA.x + j, tmpA.y, tmpA.z - j);
      }
      if (node < POT) {
        const sl = sleeves[node - SEATS]!;
        const h = count[node]! * STEP + 0.08;
        sl.sleeve.visible = count[node]! > 0;
        sl.sleeve.scale.set(1, h, 1);
        sl.sleeve.position.y = h / 2;
        sl.ring.visible = t > film.joins[node - SEATS]! + 0.3;
      }
    }

    // Flights.
    let motes = 0;
    for (const f of film.flights) {
      if (t <= f.t0 || t >= f.t1) continue;
      const u = easeInOut((t - f.t0) / (f.t1 - f.t0));
      nodePoint(f.to, f.dstSlot, lift, null, tmpB);
      nodePoint(f.from, f.srcSlot, lift, tmpB, tmpA);
      if (f.to === RESERVE) nodePoint(f.to, 0, lift, tmpA, tmpB);
      const dist = tmpA.distanceTo(tmpB);
      tmpC.addVectors(tmpA, tmpB).multiplyScalar(0.5);
      tmpC.y = Math.max(tmpA.y, tmpB.y) + 0.7 + dist * 0.22;
      // Quadratic Bézier.
      const a = (1 - u) * (1 - u);
      const b = 2 * (1 - u) * u;
      const d = u * u;
      const x = a * tmpA.x + b * tmpC.x + d * tmpB.x;
      const y = a * tmpA.y + b * tmpC.y + d * tmpB.y;
      const z = a * tmpA.z + b * tmpC.z + d * tmpB.z;
      if (f.mote) {
        if (motes >= MAX_MOTES) continue;
        const pulse = 1 + 0.25 * Math.sin(u * Math.PI);
        tmp.position.set(x, y, z);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(pulse, pulse, pulse);
        tmp.updateMatrix();
        moteMesh.setMatrixAt(motes, tmp.matrix);
        haloMesh.setMatrixAt(motes, tmp.matrix);
        motes++;
      } else {
        // One full tumble end over end, flat again on landing.
        axis.set(tmpB.z - tmpA.z, 0, tmpA.x - tmpB.x);
        if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
        axis.normalize();
        put(x, y, z, u * Math.PI * 2);
      }
    }
    coinMesh.count = n;
    coinMesh.instanceMatrix.needsUpdate = true;
    moteMesh.count = haloMesh.count = motes;
    moteMesh.instanceMatrix.needsUpdate = true;
    haloMesh.instanceMatrix.needsUpdate = true;

    // Reserve glow follows what it holds (the most it ever holds is about ₹960 here).
    const r = clamp01(value[RESERVE]! / 960);
    reserveMat.emissiveIntensity = 0.15 + r * 1.8;
    reserveMat.opacity = 1 - logo;
    reserveGlowMat.opacity = r * 0.35 * (1 - logo);

    // A missed payment: an amber ring pulses round the member while it's covered.
    let miss: { seat: number; k: number } | null = null;
    for (const m of film.misses) {
      const k = smooth(m.t0, m.t0 + 0.3, t) * (1 - smooth(m.t1, m.t1 + 0.6, t));
      if (k > 0.001) miss = { seat: m.member, k };
    }
    missRing.visible = !!miss;
    if (miss) {
      onRing(RING, angleOf(miss.seat), 0.014, missRing.position);
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
      missRing.scale.setScalar(1 + 0.08 * pulse);
      missMat.opacity = miss.k * (0.55 + 0.45 * pulse);
    }

    // Marker.
    if (turn) {
      onRing(RING, turn.angle, 0.012, seatTmp);
      marker.position.copy(seatTmp);
      markerGlow.position.copy(seatTmp);
      marker.visible = markerGlow.visible = true;
      const breathe = 1 + 0.03 * Math.sin(now * 0.004);
      marker.scale.setScalar(turn.strength * breathe);
      markerGlow.scale.setScalar(turn.strength * breathe);
      markerMat.opacity = turn.strength;
      markerGlowMat.opacity = 0.22 * turn.strength;
      markerLight.position.set(seatTmp.x, 1.1, seatTmp.z);
      markerLight.intensity = 5 * turn.strength;
    } else {
      marker.visible = markerGlow.visible = false;
      markerLight.intensity = 0;
    }

    // Bids.
    for (const { mesh, bid } of bidCards) {
      const on = t > bid.t0 && t < bid.t1;
      mesh.visible = on;
      if (!on) continue;
      const rise = easeOutBack(clamp01((t - bid.t0) / 0.6));
      const out = 1 - smooth(bid.t1 - 0.35, bid.t1, t);
      const lose = bid.won ? 1 : 1 - smooth(bid.tReveal + 0.9, bid.tReveal + 1.4, t) * 0.6;
      const win = bid.won ? 1 + smooth(bid.tReveal + 0.6, bid.tReveal + 1, t) * 0.18 : 1;
      // Hovering just over the bidder's own token, so it reads as theirs from any angle.
      const home = tokens[bid.member]!.home;
      mesh.position.set(home.x, TOKEN_H + 0.2 + rise * 0.42 + Math.sin(now * 0.002 + bid.member) * 0.02, home.z);
      mesh.quaternion.copy(camera.quaternion);
      mesh.rotateY(Math.PI * easeInOut(clamp01((t - bid.tReveal) / 0.55)));
      mesh.scale.setScalar(Math.max(0.001, clamp01(rise) * out * lose * win));
    }

    renderer.render(scene, camera);
  }

  /** Where the marker is at time t: its angle on the ring and how present it is. */
  function markerAt(t: number) {
    let from: number | null = null;
    for (const tr of film.turns) {
      if (t < tr.t0) break;
      if (t >= tr.t1) {
        from = tr.member;
        continue;
      }
      // Gliding toward tr.member, always forward (clockwise) around the ring.
      const k = easeInOut((t - tr.t0) / (tr.t1 - tr.t0));
      if (from === null) return { angle: angleOf(tr.member), seat: tr.member, strength: k };
      const steps = (tr.member - from + SEATS) % SEATS;
      return { angle: angleOf(from) + (steps * Math.PI * 2 * k) / SEATS, seat: k > 0.9 ? tr.member : -1, strength: 1 };
    }
    return from === null ? null : { angle: angleOf(from), seat: from, strength: 1 };
  }

  const projected = new Vector3();
  function anchors(out: LabelAnchor[]) {
    for (let i = 0; i < SEATS; i++) {
      const tok = tokens[i]!;
      // Rise above a bid card while this member has one up.
      let lift = 0;
      for (const b of film.bids) if (b.member === i) lift = Math.max(lift, smooth(b.t0, b.t0 + 0.5, lastT) * (1 - smooth(b.t1 - 0.35, b.t1, lastT)));
      projected.set(tok.home.x, TOKEN_H + 0.55 + lift * 0.6, tok.home.z).project(camera);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const joined = clamp01((lastT - film.joins[i]! - 0.2) / 0.4);
      const d = camera.position.distanceTo(tok.home);
      out[i] = {
        x: (projected.x * 0.5 + 0.5) * w,
        y: (-projected.y * 0.5 + 0.5) * h,
        alpha: projected.z < 1 ? joined : 0,
        scale: Math.max(0.85, Math.min(1.15, (9.5 * FRAME) / d)),
      };
    }
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const small = w < 700;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  return {
    render(t, shake, now) {
      lastT = t;
      render(t, shake, now);
    },
    anchors,
    resize,
    dispose() {
      for (const d of disposables) d.dispose();
      coinMesh.dispose();
      moteMesh.dispose();
      haloMesh.dispose();
      dots.dispose();
      renderer.dispose();
    },
  };
}
