'use client'

import { memo, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { ACCENT, ANNEX_SEATS, type Plot } from '@/features/hq/layout'
import { mats, seeded } from '@/features/hq/world/materials'

/**
 * The furniture and props that give each department its character. Purely decorative:
 * nothing here pretends to be a number or a chart. The only things that react to data are
 * the speeds of a few moving parts (faster while the agent works) and the approval cards on
 * your balcony, one per real pending approval.
 */

type StationProps = { plot: Plot; accent: string; active: boolean; pending: number }

export const Station = memo(function Station(props: StationProps) {
  switch (props.plot.station) {
    case 'tower':
      return <Tower {...props} />
    case 'lounge':
      return <Lounge {...props} />
    case 'frontdesk':
      return <FrontDesk {...props} />
    case 'gate':
      return <Gate {...props} />
    case 'maptable':
      return <MapTable {...props} />
    case 'ledger':
      return <Ledger {...props} />
    case 'postoffice':
      return <PostOffice {...props} />
    case 'garage':
      return <Garage {...props} />
    case 'lookout':
      return <Lookout {...props} />
    case 'boomerang':
      return <Boomerang {...props} />
    case 'meeting':
      return <Meeting {...props} />
    case 'balcony':
      return <Balcony {...props} />
    case 'portal':
      return <Portal {...props} />
    case 'annex':
      return <Annex {...props} />
    default:
      return null
  }
})

/** Spins a group; quicker while the agent is working. */
function useSpin(active: boolean, idle = 0.2, busy = 1.2, axis: 'y' | 'z' = 'y') {
  const ref = useRef<THREE.Group>(null)
  const speed = useRef(idle)
  useFrame((_, dt) => {
    speed.current += ((active ? busy : idle) - speed.current) * Math.min(1, dt * 2)
    if (ref.current) ref.current.rotation[axis] += dt * speed.current
  })
  return ref
}

function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.18, 0]} material={mats.furniture} castShadow>
        <cylinderGeometry args={[0.17, 0.13, 0.36, 20]} />
      </mesh>
      <mesh position={[0, 0.48, 0]} material={mats.leaf} castShadow>
        <sphereGeometry args={[0.24, 18, 14]} />
      </mesh>
      <mesh position={[0.1, 0.66, 0.05]} material={mats.leaf} castShadow>
        <sphereGeometry args={[0.15, 14, 12]} />
      </mesh>
    </group>
  )
}

// --- AI General Manager -------------------------------------------------------

function Tower({ accent, active }: StationProps) {
  const ring = useSpin(active, 0.25, 0.9)
  const ring2 = useSpin(active, -0.15, -0.6)
  const beacon = useRef<THREE.Mesh>(null)
  useFrame((f) => {
    if (beacon.current) beacon.current.scale.setScalar(1 + Math.sin(f.clock.elapsedTime * 2.4) * 0.12)
  })
  return (
    <group>
      <mesh position={[0, 0.22, 0]} material={mats.furniture} castShadow receiveShadow>
        <cylinderGeometry args={[1.75, 1.95, 0.44, 64]} />
      </mesh>
      <mesh position={[0, 3.05, 0]} material={mats.glass}>
        <cylinderGeometry args={[1.08, 1.2, 5.2, 48, 1, true]} />
      </mesh>
      <mesh position={[0, 3.05, 0]} material={mats.glowDim(accent)}>
        <cylinderGeometry args={[0.2, 0.2, 5.2, 16]} />
      </mesh>
      {[1.45, 2.65, 3.85, 5.05].map((y, i) => (
        <group key={y} position={[0, y, 0]}>
          <mesh material={mats.furniture} castShadow>
            <cylinderGeometry args={[1.32 - i * 0.03, 1.32 - i * 0.03, 0.12, 48]} />
          </mesh>
          <mesh position={[0, -0.07, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.glow(accent)}>
            <torusGeometry args={[1.31 - i * 0.03, 0.012, 6, 64]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 5.65, 0]} material={mats.furniture} castShadow>
        <sphereGeometry args={[1.18, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[0, 7.0, 0]} material={mats.joint}>
        <cylinderGeometry args={[0.04, 0.09, 1.4, 10]} />
      </mesh>
      <mesh ref={beacon} position={[0, 7.8, 0]} material={mats.glow(accent)}>
        <sphereGeometry args={[0.16, 20, 16]} />
      </mesh>
      <group ref={ring} position={[0, 3.3, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.glow('#8fe3ff')}>
          <torusGeometry args={[2.05, 0.02, 6, 96]} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos((i * Math.PI * 2) / 3) * 2.05, 0, Math.sin((i * Math.PI * 2) / 3) * 2.05]} rotation={[0, -(i * Math.PI * 2) / 3 + Math.PI / 2, 0]} material={mats.holo(accent)}>
            <planeGeometry args={[0.7, 0.42]} />
          </mesh>
        ))}
      </group>
      <group ref={ring2} position={[0, 4.4, 0]} rotation={[0.18, 0, 0.1]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.glowDim(accent)}>
          <torusGeometry args={[1.7, 0.012, 6, 80]} />
        </mesh>
      </group>
      <Plant position={[-3.6, 0, 1.6]} />
      <Plant position={[1.4, 0, -3.7]} scale={0.85} />
      <Plant position={[-2.4, 0, -3.1]} scale={0.7} />
    </group>
  )
}

// --- Sales ---------------------------------------------------------------------

function Bubble({ position, color, scale = 1 }: { position: [number, number, number]; color: string; scale?: number }) {
  const ref = useRef<THREE.Group>(null)
  const seed = seeded(position[0] * 5 + position[1] * 3 + position[2]) * 10
  useFrame((f) => {
    if (ref.current) ref.current.position.y = position[1] + Math.sin(f.clock.elapsedTime * 1.1 + seed) * 0.12
  })
  return (
    <group ref={ref} position={position} scale={scale} rotation={[0, Math.PI / 4, 0]}>
      <RoundedBox args={[0.62, 0.4, 0.12]} radius={0.12} smoothness={3} material={mats.accent(color)} castShadow />
      <mesh position={[-0.18, -0.24, 0]} rotation={[0, 0, 0.5]} material={mats.accent(color)}>
        <coneGeometry args={[0.07, 0.16, 3]} />
      </mesh>
      {[-0.14, 0, 0.14].map((x) => (
        <mesh key={x} position={[x, 0, 0.065]} material={mats.glow('#ffffff')}>
          <circleGeometry args={[0.035, 12]} />
        </mesh>
      ))}
    </group>
  )
}

function Sofa({ position, rotationY }: { position: [number, number, number]; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RoundedBox args={[1.5, 0.28, 0.62]} radius={0.12} smoothness={3} position={[0, 0.24, 0]} material={mats.cushion} castShadow />
      <RoundedBox args={[1.5, 0.5, 0.2]} radius={0.1} smoothness={3} position={[0, 0.5, -0.24]} material={mats.cushion} castShadow />
      {[-0.72, 0.72].map((x) => (
        <RoundedBox key={x} args={[0.18, 0.4, 0.62]} radius={0.08} smoothness={3} position={[x, 0.34, 0]} material={mats.furniture} castShadow />
      ))}
    </group>
  )
}

function Lounge({ accent }: StationProps) {
  return (
    <group>
      <Sofa position={[-1.75, 0, 0.75]} rotationY={Math.PI / 2 + 0.35} />
      <mesh position={[-0.85, 0.24, 1.55]} material={mats.furniture} castShadow>
        <cylinderGeometry args={[0.34, 0.3, 0.06, 32]} />
      </mesh>
      <mesh position={[-0.85, 0.11, 1.55]} material={mats.joint}>
        <cylinderGeometry args={[0.04, 0.08, 0.22, 12]} />
      </mesh>
      <Bubble position={[-0.4, 2.55, -1.6]} color={accent} />
      <Bubble position={[0.55, 2.15, -1.95]} color="#ffffff" scale={0.75} />
      <Plant position={[1.75, 0, 1.2]} />
    </group>
  )
}

// --- Website Concierge -----------------------------------------------------------

function FrontDesk({ accent, active }: StationProps) {
  const globe = useSpin(active, 0.3, 1.4)
  return (
    <group>
      <mesh position={[-0.35, 0.36, -0.35]} rotation={[0, Math.PI / 4 + Math.PI * 0.2, 0]} material={mats.furniture} castShadow>
        <torusGeometry args={[1.0, 0.16, 16, 48, Math.PI * 0.6]} />
      </mesh>
      <group position={[1.15, 0, -0.95]}>
        <mesh position={[0, 0.3, 0]} material={mats.furniture} castShadow>
          <cylinderGeometry args={[0.12, 0.2, 0.6, 20]} />
        </mesh>
        <group ref={globe} position={[0, 0.95, 0]}>
          <mesh material={mats.accent(accent)} castShadow>
            <sphereGeometry args={[0.32, 32, 20]} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.glow('#ffffff')}>
            <torusGeometry args={[0.33, 0.01, 6, 40]} />
          </mesh>
          <mesh rotation={[0, 0, 0]} material={mats.glow('#ffffff')}>
            <torusGeometry args={[0.33, 0.01, 6, 40]} />
          </mesh>
        </group>
      </group>
      <Plant position={[-1.55, 0, 0.9]} scale={0.8} />
    </group>
  )
}

// --- Quality ----------------------------------------------------------------------

function Gate({ accent, active }: StationProps) {
  const scan = useRef<THREE.Mesh>(null)
  useFrame((f) => {
    if (!scan.current) return
    const speed = active ? 2.4 : 0.8
    scan.current.position.y = 0.2 + (Math.sin(f.clock.elapsedTime * speed) * 0.5 + 0.5) * 1.6
  })
  const P1: [number, number] = [-1.75, 0.55]
  const P2: [number, number] = [0.55, -1.75]
  const half = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]) / 2
  const mid: [number, number] = [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2]
  return (
    <group>
      {[P1, P2].map(([x, z]) => (
        <mesh key={x} position={[x, 0.9, z]} material={mats.furniture} castShadow>
          <cylinderGeometry args={[0.13, 0.17, 1.8, 20]} />
        </mesh>
      ))}
      <group position={[mid[0], 1.8, mid[1]]} rotation={[0, Math.PI / 4, 0]}>
        <mesh material={mats.furniture} castShadow>
          <torusGeometry args={[half, 0.13, 16, 48, Math.PI]} />
        </mesh>
        <mesh material={mats.glow(accent)}>
          <torusGeometry args={[half - 0.14, 0.015, 6, 48, Math.PI]} />
        </mesh>
      </group>
      <group position={[mid[0], 0, mid[1]]} rotation={[0, Math.PI / 4, 0]}>
        <mesh ref={scan} material={mats.holo(accent)}>
          <boxGeometry args={[half * 2 - 0.2, 0.04, 0.5]} />
        </mesh>
      </group>
      <group position={[1.35, 0, 0.95]}>
        <RoundedBox args={[0.5, 0.7, 0.5]} radius={0.08} smoothness={3} position={[0, 0.35, 0]} material={mats.furniture} castShadow />
        <mesh position={[0, 0.72, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.glow(ACCENT.green)}>
          <ringGeometry args={[0.1, 0.14, 24]} />
        </mesh>
      </group>
    </group>
  )
}

// --- Travel Planner ------------------------------------------------------------------

/** A rough outline of Sri Lanka, for the hologram on the map table. */
const SRI_LANKA: [number, number][] = [
  [0.0, 1.0], [0.12, 0.86], [0.2, 0.62], [0.34, 0.38], [0.42, 0.1], [0.44, -0.18], [0.36, -0.46], [0.2, -0.7],
  [0.02, -0.86], [-0.18, -0.8], [-0.32, -0.6], [-0.4, -0.3], [-0.38, 0.0], [-0.3, 0.3], [-0.2, 0.55], [-0.12, 0.8],
]

function MapTable({ accent, active }: StationProps) {
  const holo = useRef<THREE.Group>(null)
  const shape = useMemo(() => {
    const s = new THREE.Shape()
    SRI_LANKA.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
    s.closePath()
    return s
  }, [])
  useFrame((f, dt) => {
    if (!holo.current) return
    holo.current.rotation.y += dt * (active ? 0.6 : 0.15)
    holo.current.position.y = 1.15 + Math.sin(f.clock.elapsedTime * 1.3) * 0.04
  })
  return (
    <group>
      <group position={[1.05, 0, 0.85]}>
        <mesh position={[0, 0.62, 0]} material={mats.furniture} castShadow receiveShadow>
          <cylinderGeometry args={[0.85, 0.8, 0.1, 40]} />
        </mesh>
        <mesh position={[0, 0.68, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.holo(accent)}>
          <circleGeometry args={[0.72, 40]} />
        </mesh>
        <mesh position={[0, 0.3, 0]} material={mats.joint}>
          <cylinderGeometry args={[0.08, 0.2, 0.6, 16]} />
        </mesh>
        <group ref={holo} position={[0, 1.15, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} scale={0.55} material={mats.accent(accent)}>
            <extrudeGeometry args={[shape, { depth: 0.12, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }]} />
          </mesh>
          {[
            [0.05, 0.35],
            [0.12, -0.05],
            [-0.08, -0.25],
            [0.1, -0.38],
          ].map(([x, z], i) => (
            <mesh key={i} position={[x * 0.55, 0.16, -z * 0.55]} material={mats.glow(ACCENT.coral)}>
              <coneGeometry args={[0.035, 0.12, 10]} />
            </mesh>
          ))}
        </group>
      </group>
      <group position={[-1.85, 0, 0.45]} rotation={[0, Math.PI / 2 + 0.4, 0]}>
        <RoundedBox args={[1.1, 1.2, 0.32]} radius={0.06} smoothness={3} position={[0, 0.6, 0]} material={mats.furniture} castShadow />
        {[0.32, 0.72].map((y) => (
          <group key={y}>
            {[-0.36, -0.2, -0.06, 0.12, 0.3].map((x, i) => (
              <mesh key={x} position={[x, y + 0.12, 0.08]} material={mats.accent(i % 2 ? accent : ACCENT.sky)}>
                <boxGeometry args={[0.1, 0.24 + (i % 3) * 0.04, 0.18]} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  )
}

// --- Pricing ---------------------------------------------------------------------------

function Ledger({ accent, active }: StationProps) {
  const pages = useRef<THREE.Group>(null)
  useFrame((f) => {
    if (!pages.current) return
    pages.current.children.forEach((c, i) => {
      c.position.y = 1.1 + i * 0.22 + Math.sin(f.clock.elapsedTime * (active ? 2.5 : 1) + i) * 0.05
    })
  })
  return (
    <group>
      <group position={[1.1, 0, 0.8]}>
        {[
          [0, 0, 5],
          [0.32, 0.12, 3],
          [0.12, -0.3, 4],
        ].map(([x, z, n], i) => (
          <group key={i} position={[x, 0, z]}>
            {Array.from({ length: n }, (_, k) => (
              <mesh key={k} position={[0, 0.05 + k * 0.07, 0]} material={mats.accent(accent)} castShadow>
                <cylinderGeometry args={[0.13, 0.13, 0.06, 24]} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      <group position={[-1.5, 0, 0.75]} rotation={[0, Math.PI / 2 + 0.4, 0]}>
        <RoundedBox args={[1.0, 0.7, 0.55]} radius={0.06} smoothness={3} position={[0, 0.35, 0]} material={mats.furniture} castShadow />
        <group ref={pages}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, 1.1 + i * 0.22, 0]} rotation={[-0.25, 0, 0]} material={mats.holo(i === 1 ? accent : '#bfe9ff')}>
              <planeGeometry args={[0.7, 0.42]} />
            </mesh>
          ))}
        </group>
      </group>
      <Plant position={[1.6, 0, -1.3]} scale={0.8} />
    </group>
  )
}

// --- Follow-up ---------------------------------------------------------------------------

function Envelope({ color }: { color: string }) {
  return (
    <group>
      <mesh material={mats.furniture} castShadow>
        <boxGeometry args={[0.36, 0.24, 0.03]} />
      </mesh>
      <mesh position={[0, 0.03, 0.018]} rotation={[0, 0, Math.PI / 4]} material={mats.accent(color)}>
        <boxGeometry args={[0.17, 0.17, 0.005]} />
      </mesh>
    </group>
  )
}

function PostOffice({ accent, active }: StationProps) {
  const orbit = useSpin(active, 0.35, 1.6)
  return (
    <group>
      <group position={[1.2, 0, 0.85]} rotation={[0, Math.PI / 4, 0]}>
        <mesh position={[0, 0.3, 0]} material={mats.joint}>
          <cylinderGeometry args={[0.05, 0.05, 0.6, 10]} />
        </mesh>
        <RoundedBox args={[0.42, 0.34, 0.6]} radius={0.06} smoothness={3} position={[0, 0.72, 0]} material={mats.accent(accent)} castShadow />
        <mesh position={[0, 0.89, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.accent(accent)}>
          <cylinderGeometry args={[0.21, 0.21, 0.6, 20, 1, false, 0, Math.PI]} />
        </mesh>
        <mesh position={[0.24, 1.0, 0.1]} material={mats.glow(ACCENT.red)}>
          <boxGeometry args={[0.02, 0.18, 0.12]} />
        </mesh>
      </group>
      <group position={[-1.5, 0, 0.6]}>
        <mesh position={[0, 0.7, 0]} material={mats.furniture} castShadow>
          <cylinderGeometry args={[0.16, 0.22, 1.4, 20]} />
        </mesh>
        <group ref={orbit} position={[0, 1.65, 0]}>
          {[0, 1, 2, 3].map((i) => (
            <group key={i} position={[Math.cos((i * Math.PI) / 2) * 0.6, Math.sin(i) * 0.1, Math.sin((i * Math.PI) / 2) * 0.6]} rotation={[0, -(i * Math.PI) / 2, 0.1]}>
              <Envelope color={i % 2 ? accent : ACCENT.sky} />
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}

// --- Operations ------------------------------------------------------------------------------

function Car({ accent }: { accent: string }) {
  return (
    <group>
      <RoundedBox args={[0.6, 0.24, 1.1]} radius={0.1} smoothness={3} position={[0, 0.24, 0]} material={mats.furniture} castShadow />
      <RoundedBox args={[0.5, 0.22, 0.56]} radius={0.1} smoothness={3} position={[0, 0.44, -0.06]} material={mats.visor} />
      <mesh position={[0, 0.3, 0.56]} material={mats.glow('#fff6d8')}>
        <boxGeometry args={[0.44, 0.05, 0.02]} />
      </mesh>
      <mesh position={[0, 0.3, -0.56]} material={mats.glow(accent)}>
        <boxGeometry args={[0.44, 0.05, 0.02]} />
      </mesh>
      {[
        [-0.3, 0.36],
        [0.3, 0.36],
        [-0.3, -0.36],
        [0.3, -0.36],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.12, z]} rotation={[0, 0, Math.PI / 2]} material={mats.tyre}>
          <cylinderGeometry args={[0.12, 0.12, 0.1, 18]} />
        </mesh>
      ))}
    </group>
  )
}

function Garage({ accent }: StationProps) {
  return (
    <group>
      <group position={[1.05, 0, 0.95]} rotation={[0, Math.PI / 4 + 0.2, 0]}>
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.tyre}>
          <planeGeometry args={[0.95, 2.1]} />
        </mesh>
        {[-0.7, 0, 0.7].map((z) => (
          <mesh key={z} position={[0, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]} material={mats.glow('#ffffff')}>
            <planeGeometry args={[0.05, 0.3]} />
          </mesh>
        ))}
        <Car accent={accent} />
      </group>
      <group position={[-1.45, 0, 0.55]} rotation={[0, Math.PI / 2 + 0.4, 0]}>
        {[-0.75, 0.75].map((x) => (
          <mesh key={x} position={[x, 0.65, 0]} material={mats.furniture} castShadow>
            <boxGeometry args={[0.12, 1.3, 0.12]} />
          </mesh>
        ))}
        <RoundedBox args={[1.8, 0.12, 0.9]} radius={0.05} smoothness={2} position={[0, 1.34, 0]} material={mats.furniture} castShadow />
        <mesh position={[0, 1.27, 0.42]} material={mats.glow(accent)}>
          <boxGeometry args={[1.6, 0.03, 0.02]} />
        </mesh>
      </group>
      {[
        [1.9, -0.3],
        [1.65, -0.75],
      ].map(([x, z]) => (
        <group key={x} position={[x, 0, z]}>
          <mesh position={[0, 0.17, 0]} material={mats.accent(accent)} castShadow>
            <coneGeometry args={[0.1, 0.34, 16]} />
          </mesh>
          <mesh position={[0, 0.17, 0]} material={mats.furniture}>
            <cylinderGeometry args={[0.062, 0.075, 0.07, 16]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// --- Lead Scout ------------------------------------------------------------------------------

function Lookout({ accent, active }: StationProps) {
  const dish = useSpin(active, 0.4, 1.8)
  return (
    <group>
      <group position={[1.0, 0, 0.75]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.cos((i * Math.PI * 2) / 3) * 0.16, 0.36, Math.sin((i * Math.PI * 2) / 3) * 0.16]} rotation={[Math.sin((i * Math.PI * 2) / 3) * 0.25, 0, -Math.cos((i * Math.PI * 2) / 3) * 0.25]} material={mats.joint}>
            <cylinderGeometry args={[0.025, 0.025, 0.76, 8]} />
          </mesh>
        ))}
        <mesh position={[0.1, 0.86, 0.1]} rotation={[0.9, 0.8, 0]} material={mats.furniture} castShadow>
          <cylinderGeometry args={[0.1, 0.07, 0.8, 20]} />
        </mesh>
        <mesh position={[0.28, 1.08, 0.3]} rotation={[0.9, 0.8, 0]} material={mats.accent(accent)}>
          <cylinderGeometry args={[0.11, 0.11, 0.06, 20]} />
        </mesh>
      </group>
      <group position={[-1.35, 0, 0.35]}>
        <mesh position={[0, 0.65, 0]} material={mats.furniture} castShadow>
          <cylinderGeometry args={[0.08, 0.16, 1.3, 14]} />
        </mesh>
        <group ref={dish} position={[0, 1.35, 0]}>
          <mesh rotation={[-0.9, 0, 0]} material={mats.furniture} castShadow>
            <sphereGeometry args={[0.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 3.2]} />
          </mesh>
          <mesh position={[0, 0.2, 0.18]} material={mats.glow(accent)}>
            <sphereGeometry args={[0.06, 12, 10]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

// --- Win-back --------------------------------------------------------------------------------

function Boomerang({ accent, active }: StationProps) {
  const loop = useSpin(active, 0.5, 2.2, 'z')
  return (
    <group>
      <group position={[-1.25, 1.35, 0.55]} rotation={[0, Math.PI / 4, 0]}>
        <group ref={loop}>
          <mesh material={mats.accent(accent)}>
            <torusGeometry args={[0.45, 0.06, 12, 48, Math.PI * 1.55]} />
          </mesh>
          <mesh position={[0.45, -0.02, 0]} rotation={[0, 0, Math.PI]} material={mats.accent(accent)}>
            <coneGeometry args={[0.13, 0.26, 16]} />
          </mesh>
        </group>
      </group>
      <mesh position={[-1.25, 0.4, 0.55]} material={mats.furniture} castShadow>
        <cylinderGeometry args={[0.3, 0.36, 0.8, 24]} />
      </mesh>
      <group position={[1.05, 0, 0.85]} rotation={[0, Math.PI / 4, 0]}>
        <RoundedBox args={[0.7, 0.18, 0.5]} radius={0.05} smoothness={2} position={[0, 0.09, 0]} material={mats.furniture} castShadow />
        {[0, 1, 2].map((i) => (
          <group key={i} position={[0, 0.2 + i * 0.035, 0]} rotation={[-Math.PI / 2, 0, i * 0.12]}>
            <Envelope color={accent} />
          </group>
        ))}
      </group>
      <Plant position={[1.5, 0, -1.0]} scale={0.75} />
    </group>
  )
}

// --- Partners --------------------------------------------------------------------------------

function Meeting({ accent, active }: StationProps) {
  const links = useSpin(active, 0.4, 1.6)
  return (
    <group>
      <group position={[1.0, 0, 0.9]}>
        <mesh position={[0, 0.5, 0]} material={mats.furniture} castShadow receiveShadow>
          <cylinderGeometry args={[0.5, 0.5, 0.06, 32]} />
        </mesh>
        <mesh position={[0, 0.25, 0]} material={mats.joint}>
          <cylinderGeometry args={[0.05, 0.14, 0.5, 12]} />
        </mesh>
        {[0.9, -0.9].map((a) => (
          <group key={a} position={[Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85]} rotation={[0, -a - Math.PI / 2, 0]}>
            <RoundedBox args={[0.42, 0.1, 0.42]} radius={0.04} smoothness={2} position={[0, 0.34, 0]} material={mats.cushion} castShadow />
            <RoundedBox args={[0.42, 0.4, 0.08]} radius={0.04} smoothness={2} position={[0, 0.56, -0.18]} material={mats.cushion} castShadow />
          </group>
        ))}
      </group>
      <group ref={links} position={[-1.25, 1.4, 0.45]}>
        <mesh rotation={[0, 0, 0]} position={[-0.17, 0, 0]} material={mats.accent(accent)}>
          <torusGeometry args={[0.28, 0.05, 12, 36]} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0.17, 0, 0]} material={mats.accent(ACCENT.sky)}>
          <torusGeometry args={[0.28, 0.05, 12, 36]} />
        </mesh>
      </group>
      <mesh position={[-1.25, 0.45, 0.45]} material={mats.furniture} castShadow>
        <cylinderGeometry args={[0.24, 0.3, 0.9, 20]} />
      </mesh>
    </group>
  )
}

// --- Your balcony ----------------------------------------------------------------------------

/** One floating card per real pending approval (up to 6 are drawn; the HUD shows the full count). */
function Balcony({ pending }: StationProps) {
  const cards = useRef<THREE.Group>(null)
  useFrame((f) => {
    cards.current?.children.forEach((c, i) => {
      c.position.y = 1.3 + i * 0.2 + Math.sin(f.clock.elapsedTime * 2 + i) * 0.05
      c.rotation.y = Math.PI / 4 + Math.sin(f.clock.elapsedTime * 0.8 + i) * 0.15
    })
  })
  const shown = Math.min(pending, 6)
  return (
    <group>
      {/* Railing on the hub side */}
      <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, Math.PI * 0.75]} material={mats.furniture}>
        <torusGeometry args={[2.55, 0.05, 10, 64, Math.PI]} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation={[0, Math.PI * 0.75 + Math.PI / 2, 0]} material={mats.glass}>
        <cylinderGeometry args={[2.55, 2.55, 0.5, 48, 1, true, 0, Math.PI]} />
      </mesh>
      {/* Chair, turned towards the command tower */}
      <group position={[0.55, 0, 0.55]} rotation={[0, Math.PI + Math.PI / 4, 0]}>
        <RoundedBox args={[0.8, 0.18, 0.7]} radius={0.08} smoothness={3} position={[0, 0.42, 0]} material={mats.cushion} castShadow />
        <RoundedBox args={[0.8, 0.8, 0.16]} radius={0.08} smoothness={3} position={[0, 0.8, -0.3]} material={mats.furniture} castShadow />
        <mesh position={[0, 0.2, 0]} material={mats.joint}>
          <cylinderGeometry args={[0.06, 0.2, 0.4, 14]} />
        </mesh>
      </group>
      {/* Approval pedestal */}
      <group position={[-0.65, 0, -0.65]}>
        <mesh position={[0, 0.45, 0]} material={mats.furniture} castShadow>
          <cylinderGeometry args={[0.32, 0.4, 0.9, 28]} />
        </mesh>
        <mesh position={[0, 0.91, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.glow(pending ? ACCENT.amber : ACCENT.green)}>
          <ringGeometry args={[0.18, 0.26, 32]} />
        </mesh>
        <group ref={cards}>
          {Array.from({ length: shown }, (_, i) => (
            <RoundedBox key={i} args={[0.6, 0.36, 0.03]} radius={0.04} smoothness={2} position={[0, 1.3 + i * 0.2, 0]} material={mats.accent(ACCENT.amber)} />
          ))}
        </group>
      </group>
      <Plant position={[1.6, 0, -1.2]} scale={0.8} />
    </group>
  )
}

// --- Customers and CRM gateway ---------------------------------------------------------------

function Portal({ active }: StationProps) {
  const icons = useSpin(active, 0.35, 1.2)
  const disc = useRef<THREE.Mesh>(null)
  useFrame((f) => {
    if (disc.current) (disc.current.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(f.clock.elapsedTime * 1.5) * 0.06
  })
  // Faces the command tower.
  const yaw = Math.atan2(21.6, -1.8)
  return (
    <group rotation={[0, yaw, 0]}>
      <mesh position={[0, 2.0, 0]} material={mats.furniture} castShadow>
        <torusGeometry args={[1.75, 0.2, 20, 64]} />
      </mesh>
      <mesh position={[0, 2.0, 0.02]} material={mats.glow('#8fe3ff')}>
        <torusGeometry args={[1.52, 0.025, 8, 64]} />
      </mesh>
      <mesh ref={disc} position={[0, 2.0, 0]}>
        <circleGeometry args={[1.5, 48]} />
        <meshBasicMaterial color="#9fe7ff" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <RoundedBox args={[1.8, 0.3, 0.8]} radius={0.1} smoothness={3} position={[0, 0.15, 0]} material={mats.furniture} castShadow />
      <group ref={icons} position={[0, 2.0, 0]}>
        <group position={[2.35, 0.5, 0]}>
          <Bubble position={[0, 0, 0]} color={ACCENT.green} scale={0.7} />
        </group>
        <group position={[-2.3, -0.3, 0.4]} rotation={[0, 0.4, 0]}>
          <Envelope color={ACCENT.sky} />
        </group>
        <mesh position={[0.2, 1.95, 0.3]} material={mats.accent(ACCENT.sky)}>
          <sphereGeometry args={[0.2, 24, 16]} />
        </mesh>
      </group>
    </group>
  )
}

// --- Claude annex ----------------------------------------------------------------------------

function Annex({ accent, active }: StationProps) {
  const spark = useSpin(active, 0.3, 1.2)
  return (
    <group>
      <group ref={spark} position={[0, 1.4, 0]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI) / 4, Math.PI / 2]} material={mats.accent(accent)}>
            <capsuleGeometry args={[0.06, 0.62, 4, 10]} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0.4, 0]} material={mats.furniture} castShadow>
        <cylinderGeometry args={[0.28, 0.4, 0.8, 24]} />
      </mesh>
      {ANNEX_SEATS.map(([x, z], i) => (
        <group key={i} position={[x * 1.32, 0, z * 1.32]} rotation={[0, Math.atan2(x, z) + Math.PI, 0]}>
          <RoundedBox args={[0.8, 0.06, 0.45]} radius={0.03} smoothness={2} position={[0, 0.48, 0]} material={mats.furniture} castShadow />
          <mesh position={[0, 0.24, 0]} material={mats.joint}>
            <cylinderGeometry args={[0.04, 0.1, 0.48, 10]} />
          </mesh>
          <group position={[0, 0.52, -0.08]} rotation={[-0.35, 0, 0]}>
            <RoundedBox args={[0.42, 0.28, 0.02]} radius={0.02} smoothness={2} position={[0, 0.14, 0]} material={mats.screen} />
          </group>
        </group>
      ))}
    </group>
  )
}
