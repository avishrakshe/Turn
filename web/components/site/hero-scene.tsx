"use client";
// The Turn story in 3D: members sit on a glowing ring. Each round everyone's contribution flies into the pot, then
// the golden pot travels to one member, who lights up. Round after round, until everyone has had a turn.
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const N = 6;
const R = 2.25;
const TURN = 3.2; // seconds per round
const COLORS = ["#3fb79d", "#e8784a", "#8b6fd6", "#4d9be0", "#e0609f", "#d9b441"];

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
// Scene constants and scratch vectors live at module scope: the frame loop mutates three.js objects, not React state.
const SEATS = Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2 + Math.PI / 2;
  return new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R);
});
const CENTER = new THREE.Vector3(0, 0.55, 0);
const tmp = new THREE.Vector3();
const dest = new THREE.Vector3();

// Deterministic "random" dust (a tiny LCG), so every render and every visit looks the same.
function dustGeometry() {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i++) {
    const r = 3 + rnd() * 6;
    const a = rnd() * Math.PI * 2;
    p[i * 3] = Math.cos(a) * r;
    p[i * 3 + 1] = (rnd() - 0.5) * 5;
    p[i * 3 + 2] = Math.sin(a) * r;
  }
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  return g;
}

function withEnvironment(gl: THREE.WebGLRenderer, scene: THREE.Scene) {
  const pmrem = new THREE.PMREMGenerator(gl);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

function Dust() {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => dustGeometry(), []);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.02;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.025} color="#9fe3d0" transparent opacity={0.55} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function Circle({ still }: { still: boolean }) {
  const group = useRef<THREE.Group>(null);
  const members = useRef<(THREE.Mesh | null)[]>([]);
  const halos = useRef<(THREE.Mesh | null)[]>([]);
  const coins = useRef<(THREE.Mesh | null)[]>([]);
  const pot = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const seats = SEATS;
  const start = useRef<number | null>(null);

  useFrame((state) => {
    const g = group.current;
    if (!g || !pot.current) return;
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = still ? TURN * 2 + TURN * 0.62 : state.clock.elapsedTime - start.current;

    // Slow orbit plus a little pointer parallax.
    g.rotation.y = still ? 0.3 : t * 0.08 + state.pointer.x * 0.25;
    g.rotation.x = -0.05 + state.pointer.y * -0.08;

    const round = Math.floor(t / TURN);
    const p = (t % TURN) / TURN;
    const k = round % N;

    // 1) contributions fly in (0 → 0.38)
    const inP = ease(clamp01(p / 0.38));
    coins.current.forEach((c, i) => {
      if (!c) return;
      const from = seats[i]!;
      tmp.copy(from).lerp(CENTER, inP);
      tmp.y += Math.sin(inP * Math.PI) * 0.9;
      c.position.copy(tmp);
      const s = p < 0.4 ? 0.9 - inP * 0.6 : 0;
      c.scale.setScalar(Math.max(0, s));
      c.rotation.y = t * 4 + i;
    });

    // 2) pot grows, 3) travels to member k (0.45 → 0.78), 4) lands and fades (0.78 → 1)
    const grow = clamp01((p - 0.1) / 0.3);
    const travel = ease(clamp01((p - 0.45) / 0.33));
    const land = clamp01((p - 0.8) / 0.2);
    const target = seats[k]!;
    tmp.copy(CENTER).lerp(dest.set(target.x, 0.95, target.z), travel);
    tmp.y += Math.sin(travel * Math.PI) * 1.1;
    pot.current.position.copy(tmp);
    pot.current.rotation.y = t * 1.6;
    pot.current.scale.setScalar((0.45 + grow * 0.55) * (1 - land * 0.9));

    if (beam.current) {
      const m = beam.current.material as THREE.MeshBasicMaterial;
      beam.current.position.set(target.x, 1.2, target.z);
      m.opacity = land > 0 ? Math.sin(land * Math.PI) * 0.5 : 0;
    }

    members.current.forEach((m, i) => {
      if (!m) return;
      const bob = Math.sin(t * 1.4 + i) * 0.06;
      const isK = i === k;
      const pulse = isK && p > 0.76 ? 1 + Math.sin(clamp01((p - 0.76) / 0.24) * Math.PI) * 0.35 : 1;
      m.position.set(seats[i]!.x, 0.3 + bob, seats[i]!.z);
      m.scale.setScalar(pulse);
      const mat = m.material as THREE.MeshPhysicalMaterial;
      mat.emissiveIntensity = isK && p > 0.76 ? 0.9 : 0.12;
      // Halo for everyone who has already received this cycle (and k once the pot lands).
      const received = i < k;
      const h = halos.current[i];
      if (h) {
        h.position.set(seats[i]!.x, 0.3 + bob, seats[i]!.z);
        h.visible = received || (isK && p > 0.8);
        h.rotation.z = t;
      }
    });
  });

  return (
    <group ref={group}>
      {/* The ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R, 0.035, 16, 160]} />
        <meshStandardMaterial color="#3fb79d" emissive="#3fb79d" emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <ringGeometry args={[R - 0.5, R + 0.5, 96]} />
        <meshBasicMaterial color="#3fb79d" transparent opacity={0.06} side={THREE.DoubleSide} />
      </mesh>

      {/* Members */}
      {seats.map((s, i) => (
        <group key={i}>
          <mesh
            ref={(el) => {
              members.current[i] = el;
            }}
            position={[s.x, 0.3, s.z]}
          >
            <sphereGeometry args={[0.3, 48, 48]} />
            <meshPhysicalMaterial color={COLORS[i]} emissive={COLORS[i]} emissiveIntensity={0.12} roughness={0.38} clearcoat={0.6} clearcoatRoughness={0.4} envMapIntensity={0.6} />
          </mesh>
          <mesh
            ref={(el) => {
              halos.current[i] = el;
            }}
            visible={false}
          >
            <torusGeometry args={[0.45, 0.02, 12, 64]} />
            <meshStandardMaterial color="#f2a541" emissive="#f2a541" emissiveIntensity={2} toneMapped={false} />
          </mesh>
          {/* This member's contribution */}
          <mesh
            ref={(el) => {
              coins.current[i] = el;
            }}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.1, 0.1, 0.025, 32]} />
            <meshStandardMaterial color="#9fe3d0" metalness={0.8} roughness={0.2} emissive="#3fb79d" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}

      {/* The pot */}
      <group ref={pot}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.34, 0.34, 0.08, 64]} />
          <meshStandardMaterial color="#f2a541" metalness={1} roughness={0.18} emissive="#b8680f" emissiveIntensity={0.25} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.34, 0.03, 16, 64]} />
          <meshStandardMaterial color="#ffd27a" metalness={1} roughness={0.12} />
        </mesh>
        <pointLight color="#f2a541" intensity={6} distance={3} />
      </group>

      {/* Landing beam */}
      <mesh ref={beam}>
        <cylinderGeometry args={[0.05, 0.4, 2.4, 32, 1, true]} />
        <meshBasicMaterial color="#f2a541" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

export default function HeroScene({ still = false }: { still?: boolean }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 4.6, 8.6], fov: 40 }}
      frameloop={still ? "demand" : "always"}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ camera, gl, scene }) => {
        camera.lookAt(0, 0.1, 0);
        withEnvironment(gl, scene);
      }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} />
      <pointLight position={[-4, 2, -3]} color="#3fb79d" intensity={12} distance={12} />
      <Circle still={still} />
      {!still && <Dust />}
    </Canvas>
  );
}
