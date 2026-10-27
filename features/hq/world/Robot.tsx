'use client'

import { memo, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import type { AgentState } from '@/features/hq/engine'
import type { RobotLook } from '@/features/hq/layout'
import { ACCENT } from '@/features/hq/layout'
import { mats, seeded } from '@/features/hq/world/materials'

/**
 * A miniature robot built from soft rounded shapes. Its state comes from real agent data;
 * this file only decides how each state looks: floating, blinking, typing, thinking dots,
 * waving while it hands work over, a bouncing "!" when it needs you, a happy hop when it
 * finishes, red crossed eyes on a problem, and sleep when paused or offline.
 */

type Props = {
  look: RobotLook
  state: AgentState
  position: [number, number, number]
  /** Which way it faces when it is not working (radians). */
  facing: number
  /** Extra turn towards its screen while working. */
  workTurn?: number
  selected: boolean
  reducedMotion: boolean
  onSelect: () => void
  onHover?: (on: boolean) => void
}

const SIZES = {
  round: { body: [0.66, 0.6, 0.58, 0.27], head: [0.76, 0.56, 0.62, 0.25], bodyY: 0.56, headY: 1.13 },
  tall: { body: [0.56, 0.8, 0.5, 0.21], head: [0.68, 0.52, 0.56, 0.22], bodyY: 0.64, headY: 1.33 },
  box: { body: [0.72, 0.6, 0.58, 0.11], head: [0.78, 0.54, 0.62, 0.13], bodyY: 0.56, headY: 1.13 },
  capsule: { body: [0.6, 0.66, 0.54, 0.29], head: [0.7, 0.56, 0.6, 0.27], bodyY: 0.58, headY: 1.19 },
} as const

const EYE_COLOR: Partial<Record<AgentState, string>> = { error: ACCENT.red, waiting: ACCENT.amber }

const damp = THREE.MathUtils.damp

function RobotImpl({ look, state, position, facing, workTurn = 0.55, selected, reducedMotion, onSelect, onHover }: Props) {
  const size = SIZES[look.body]
  const scale = look.scale ?? 1
  const [hovered, setHovered] = useState(false)

  const root = useRef<THREE.Group>(null)
  const turn = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Group>(null)
  const dots = useRef<THREE.Group>(null)
  const bang = useRef<THREE.Group>(null)
  const tip = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Mesh>(null)
  const seed = seeded(position[0] * 7.1 + position[2] * 3.3) * 100
  const blinkAt = useRef(2 + (seed % 3))

  const accent = useMemo(() => mats.accent(look.accent), [look.accent])
  const eyeColor = EYE_COLOR[state] ?? look.accent
  const eyeMat = useMemo(() => mats.glow(eyeColor), [eyeColor])
  const tipMat = useMemo(() => mats.glow(state === 'error' ? ACCENT.red : look.accent).clone(), [state, look.accent])
  // Per-robot copies: these two are animated, and robots that share a colour must not share them.
  const floorMat = useMemo(() => mats.floorGlow(look.accent).clone(), [look.accent])
  const asleep = state === 'paused' || state === 'offline'
  const expression: 'normal' | 'happy' | 'closed' | 'x' | 'off' =
    state === 'offline' ? 'off' : state === 'paused' ? 'closed' : state === 'completed' ? 'happy' : state === 'error' ? 'x' : 'normal'

  useFrame((frame, dt) => {
    const t = frame.clock.elapsedTime + seed
    const calm = reducedMotion ? 0.25 : 1
    const r = root.current
    if (!r) return
    const d = Math.min(dt, 0.1)

    // Float and lift.
    const hop = state === 'completed' ? Math.abs(Math.sin(t * 6)) * 0.22 : 0
    const sink = asleep ? -0.12 : state === 'waiting' ? 0.12 : 0
    const bob = Math.sin(t * (asleep ? 0.8 : 1.6)) * (asleep ? 0.015 : 0.05) * calm
    r.position.y = damp(r.position.y, position[1] + 0.12 + sink + bob + hop * calm, 8, d)
    const shake = state === 'error' ? Math.sin(t * 38) * 0.035 * calm : 0
    r.position.x = position[0] + shake

    // Turn towards the screen while working; face you otherwise.
    if (turn.current) {
      const working = state === 'working' || state === 'thinking'
      turn.current.rotation.y = damp(turn.current.rotation.y, working ? workTurn : 0, 4, d)
      turn.current.rotation.z = damp(turn.current.rotation.z, state === 'offline' ? 0.18 : 0, 3, d)
    }

    // Head.
    if (head.current) {
      const look = state === 'idle' ? Math.sin(t * 0.45) * 0.35 * calm : state === 'communicating' ? Math.sin(t * 2.2) * 0.15 : 0
      head.current.rotation.y = damp(head.current.rotation.y, look, 3, d)
      const tilt = state === 'thinking' ? -0.22 : state === 'working' ? 0.18 : asleep ? 0.3 : state === 'completed' ? -0.12 : 0
      head.current.rotation.x = damp(head.current.rotation.x, tilt, 4, d)
      head.current.rotation.z = damp(head.current.rotation.z, state === 'thinking' ? 0.12 : 0, 3, d)
    }

    // Arms.
    const L = armL.current
    const R = armR.current
    if (L && R) {
      // Arms hang along -y; +z on the right arm (and -z on the left) lifts them outwards.
      let lx = 0.1, rx = 0.1, lz = -0.12, rz = 0.12
      if (state === 'working') {
        lx = -1.1 + Math.sin(t * 16) * 0.22 * calm
        rx = -1.1 + Math.sin(t * 16 + Math.PI) * 0.22 * calm
      } else if (state === 'thinking') {
        rx = -2.0
        rz = -0.45
      } else if (state === 'communicating') {
        rz = 2.4 + Math.sin(t * 9) * 0.35 * calm
      } else if (state === 'completed') {
        lz = -2.5
        rz = 2.5
      } else if (state === 'waiting') {
        rz = 2.7 + Math.sin(t * 5) * 0.2 * calm
      } else if (asleep) {
        lz = -0.05
        rz = 0.05
        lx = 0.25
        rx = 0.25
      }
      L.rotation.x = damp(L.rotation.x, lx, 10, d)
      R.rotation.x = damp(R.rotation.x, rx, 10, d)
      L.rotation.z = damp(L.rotation.z, lz, 8, d)
      R.rotation.z = damp(R.rotation.z, rz, 8, d)
    }

    // Blink now and then.
    if (eyes.current) {
      let sy = 1
      if (expression === 'normal') {
        if (t > blinkAt.current) {
          const k = (t - blinkAt.current) / 0.16
          sy = k < 1 ? Math.abs(1 - 2 * k) * 0.9 + 0.1 : 1
          if (k >= 1) blinkAt.current = t + 2.5 + Math.random() * 4
        }
        if (state === 'thinking') eyes.current.position.y = damp(eyes.current.position.y, 0.05, 6, d)
        else eyes.current.position.y = damp(eyes.current.position.y, 0, 6, d)
        eyes.current.position.x = damp(eyes.current.position.x, state === 'thinking' ? -0.05 : 0, 6, d)
      }
      eyes.current.scale.y = sy
    }

    // Thinking dots.
    if (dots.current) {
      dots.current.visible = state === 'thinking'
      dots.current.children.forEach((c, i) => {
        c.position.y = Math.max(0, Math.sin(t * 5 - i * 0.7)) * 0.1 * calm
      })
    }

    // "Needs you" bounce.
    if (bang.current) {
      bang.current.visible = state === 'waiting'
      bang.current.position.y = Math.abs(Math.sin(t * 3)) * 0.12 * calm
      bang.current.rotation.y = t * 1.2 * calm
    }

    // Antenna light: pulses while talking, blinks red on a problem, off when asleep.
    if (tip.current) {
      const m = tip.current.material as THREE.MeshBasicMaterial
      const pulse = state === 'communicating' ? 0.5 + 0.5 * Math.sin(t * 12) : state === 'error' ? (Math.sin(t * 6) > 0 ? 1 : 0.15) : asleep ? 0.08 : 0.7
      m.opacity = damp(m.opacity, pulse, 12, d)
      const s = state === 'communicating' ? 1.25 + 0.25 * Math.sin(t * 12) : 1
      tip.current.scale.setScalar(s)
    }

    // Floor glow under the hover jet.
    if (glow.current) {
      const m = glow.current.material as THREE.MeshBasicMaterial
      const strength = asleep ? 0.05 : state === 'working' || state === 'thinking' ? 0.55 : 0.32
      m.opacity = damp(m.opacity, strength + Math.sin(t * 3) * 0.05 * calm, 4, d)
    }
  })

  const [bw, bh, bd, br] = size.body
  const [hw, hh, hd, hr] = size.head
  const shoulderY = size.bodyY + bh * 0.22
  const shoulderX = bw / 2 + 0.06

  return (
    <group
      ref={root}
      position={[position[0], position[1] + 0.12, position[2]]}
      rotation={[0, facing, 0]}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        onHover?.(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        onHover?.(false)
        document.body.style.cursor = ''
      }}
    >
      {/* Floor glow and selection ring (stay level while the body turns). */}
      <mesh ref={glow} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} material={floorMat}>
        <circleGeometry args={[0.55, 40]} />
      </mesh>
      {(selected || hovered) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} material={selected ? mats.glow(look.accent) : mats.ghost}>
          <ringGeometry args={[0.62, 0.7, 48]} />
        </mesh>
      )}

      <group ref={turn}>
        {/* Hover jet */}
        <mesh position={[0, size.bodyY - bh / 2 - 0.08, 0]} material={mats.joint} castShadow>
          <cylinderGeometry args={[0.16, 0.1, 0.14, 24]} />
        </mesh>
        <mesh position={[0, size.bodyY - bh / 2 - 0.17, 0]} material={accent}>
          <sphereGeometry args={[0.07, 16, 12]} />
        </mesh>

        {/* Body */}
        {look.body === 'capsule' ? (
          <mesh position={[0, size.bodyY, 0]} material={mats.shell} castShadow>
            <capsuleGeometry args={[0.3, 0.12, 8, 24]} />
          </mesh>
        ) : (
          <RoundedBox args={[bw, bh, bd]} radius={br} smoothness={4} position={[0, size.bodyY, 0]} material={mats.shell} castShadow />
        )}
        {/* Chest light */}
        <RoundedBox args={[bw * 0.42, bh * 0.2, 0.04]} radius={0.04} smoothness={2} position={[0, size.bodyY + 0.02, bd / 2 - 0.005]} material={accent} />

        {/* Arms (pivot at the shoulder) */}
        <group ref={armL} position={[-shoulderX, shoulderY, 0]}>
          <mesh position={[0, -0.16, 0]} material={mats.shell} castShadow>
            <capsuleGeometry args={[0.07, 0.2, 6, 12]} />
          </mesh>
          <mesh position={[0, -0.33, 0]} material={mats.joint}>
            <sphereGeometry args={[0.075, 16, 12]} />
          </mesh>
        </group>
        <group ref={armR} position={[shoulderX, shoulderY, 0]}>
          <mesh position={[0, -0.16, 0]} material={mats.shell} castShadow>
            <capsuleGeometry args={[0.07, 0.2, 6, 12]} />
          </mesh>
          <mesh position={[0, -0.33, 0]} material={mats.joint}>
            <sphereGeometry args={[0.075, 16, 12]} />
          </mesh>
          {look.accessory === 'tablet' && (
            <RoundedBox args={[0.26, 0.34, 0.03]} radius={0.03} smoothness={2} position={[0.02, -0.36, 0.1]} rotation={[-0.4, 0, 0]} material={mats.screen} />
          )}
        </group>

        {/* Neck and head */}
        <mesh position={[0, size.headY - hh / 2 - 0.04, 0]} material={mats.joint}>
          <cylinderGeometry args={[0.1, 0.12, 0.1, 20]} />
        </mesh>
        <group ref={head} position={[0, size.headY, 0]}>
          <RoundedBox args={[hw, hh, hd]} radius={hr} smoothness={4} material={mats.shell} castShadow />
          {/* Face screen */}
          <RoundedBox args={[hw * 0.78, hh * 0.64, 0.05]} radius={Math.min(hr, 0.14)} smoothness={3} position={[0, -0.01, hd / 2 - 0.01]} material={mats.face} />
          {/* Eyes */}
          <group ref={eyes} position={[0, 0, hd / 2 + 0.022]}>
            {expression === 'normal' && (
              <>
                <mesh position={[-0.13, 0.01, 0]} material={eyeMat}>
                  <capsuleGeometry args={[0.042, 0.07, 4, 12]} />
                </mesh>
                <mesh position={[0.13, 0.01, 0]} material={eyeMat}>
                  <capsuleGeometry args={[0.042, 0.07, 4, 12]} />
                </mesh>
              </>
            )}
            {expression === 'happy' && (
              <>
                <mesh position={[-0.13, -0.01, 0]} material={eyeMat}>
                  <torusGeometry args={[0.06, 0.018, 8, 20, Math.PI]} />
                </mesh>
                <mesh position={[0.13, -0.01, 0]} material={eyeMat}>
                  <torusGeometry args={[0.06, 0.018, 8, 20, Math.PI]} />
                </mesh>
              </>
            )}
            {expression === 'closed' && (
              <>
                <mesh position={[-0.13, -0.02, 0]} rotation={[0, 0, Math.PI]} material={mats.glowDim(look.accent)}>
                  <torusGeometry args={[0.055, 0.014, 6, 16, Math.PI]} />
                </mesh>
                <mesh position={[0.13, -0.02, 0]} rotation={[0, 0, Math.PI]} material={mats.glowDim(look.accent)}>
                  <torusGeometry args={[0.055, 0.014, 6, 16, Math.PI]} />
                </mesh>
              </>
            )}
            {expression === 'x' &&
              [-0.13, 0.13].map((x) => (
                <group key={x} position={[x, 0, 0]}>
                  <mesh rotation={[0, 0, Math.PI / 4]} material={eyeMat}>
                    <boxGeometry args={[0.13, 0.03, 0.01]} />
                  </mesh>
                  <mesh rotation={[0, 0, -Math.PI / 4]} material={eyeMat}>
                    <boxGeometry args={[0.13, 0.03, 0.01]} />
                  </mesh>
                </group>
              ))}
            {/* Cheeks */}
            {expression !== 'off' && (
              <>
                <mesh position={[-0.22, -0.08, -0.004]} material={mats.blush}>
                  <circleGeometry args={[0.03, 16]} />
                </mesh>
                <mesh position={[0.22, -0.08, -0.004]} material={mats.blush}>
                  <circleGeometry args={[0.03, 16]} />
                </mesh>
              </>
            )}
          </group>

          {/* Antenna */}
          <mesh position={[0, hh / 2 + 0.08, 0]} material={mats.joint}>
            <cylinderGeometry args={[0.015, 0.02, 0.16, 8]} />
          </mesh>
          <mesh ref={tip} position={[0, hh / 2 + 0.19, 0]} material={tipMat}>
            {look.accessory === 'heart' ? <octahedronGeometry args={[0.065, 0]} /> : <sphereGeometry args={[0.055, 16, 12]} />}
          </mesh>

          <Accessory kind={look.accessory} accent={accent} hw={hw} hh={hh} hd={hd} />

          {/* Thinking dots */}
          <group ref={dots} position={[0.08, hh / 2 + 0.36, 0]} visible={false}>
            {[-0.12, 0, 0.12].map((x) => (
              <mesh key={x} position={[x, 0, 0]} material={mats.glow(look.accent)}>
                <sphereGeometry args={[0.04, 12, 10]} />
              </mesh>
            ))}
          </group>

          {/* Needs-you badge */}
          <group position={[0, hh / 2 + 0.62, 0]}>
            <group ref={bang} visible={false}>
              <mesh position={[0, 0.06, 0]} material={mats.glow(ACCENT.amber)}>
                <capsuleGeometry args={[0.045, 0.14, 4, 12]} />
              </mesh>
              <mesh position={[0, -0.13, 0]} material={mats.glow(ACCENT.amber)}>
                <sphereGeometry args={[0.05, 12, 10]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

function Accessory({ kind, accent, hw, hh, hd }: { kind: RobotLook['accessory']; accent: THREE.Material; hw: number; hh: number; hd: number }) {
  switch (kind) {
    case 'halo':
      return (
        <mesh position={[0, hh / 2 + 0.3, 0]} rotation={[Math.PI / 2, 0, 0]} material={accent}>
          <torusGeometry args={[0.24, 0.025, 10, 40]} />
        </mesh>
      )
    case 'headset':
      return (
        <group>
          <mesh position={[0, 0.02, 0]} rotation={[0, 0, 0]} material={mats.joint}>
            <torusGeometry args={[hw / 2 + 0.03, 0.022, 8, 32, Math.PI]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[(s * hw) / 2 + s * 0.03, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={accent}>
              <cylinderGeometry args={[0.1, 0.1, 0.07, 20]} />
            </mesh>
          ))}
          <mesh position={[hw / 2 - 0.02, -0.16, hd / 2 - 0.02]} rotation={[0.3, 0, 0.9]} material={mats.joint}>
            <cylinderGeometry args={[0.012, 0.012, 0.26, 6]} />
          </mesh>
          <mesh position={[hw / 2 - 0.14, -0.24, hd / 2 + 0.03]} material={accent}>
            <sphereGeometry args={[0.03, 10, 8]} />
          </mesh>
        </group>
      )
    case 'bowtie':
      return (
        <group position={[0, -hh / 2 - 0.08, hd / 2 - 0.05]}>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.07, 0, 0]} material={accent}>
            <coneGeometry args={[0.06, 0.12, 3]} />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 2]} position={[0.07, 0, 0]} material={accent}>
            <coneGeometry args={[0.06, 0.12, 3]} />
          </mesh>
        </group>
      )
    case 'visor':
      return (
        <mesh position={[0, 0.03, hd / 2 + 0.05]} material={mats.visor}>
          <boxGeometry args={[hw * 0.86, 0.14, 0.03]} />
        </mesh>
      )
    case 'monocle':
      return (
        <mesh position={[0.13, 0.01, hd / 2 + 0.04]} material={accent}>
          <torusGeometry args={[0.08, 0.014, 8, 24]} />
        </mesh>
      )
    case 'cap':
      return (
        <group position={[0, hh / 2 - 0.02, 0]}>
          <mesh material={accent} castShadow>
            <sphereGeometry args={[hw * 0.44, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh position={[0, 0.0, hd / 2 - 0.02]} rotation={[0.08, 0, 0]} material={accent}>
            <boxGeometry args={[hw * 0.6, 0.025, 0.24]} />
          </mesh>
        </group>
      )
    case 'dish':
      return (
        <group position={[hw / 2 + 0.02, hh / 2 - 0.02, 0]} rotation={[0, 0, -0.6]}>
          <mesh material={mats.joint}>
            <cylinderGeometry args={[0.012, 0.012, 0.18, 6]} />
          </mesh>
          <mesh position={[0, 0.12, 0]} rotation={[Math.PI, 0, 0]} material={accent}>
            <sphereGeometry args={[0.1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3]} />
          </mesh>
        </group>
      )
    case 'satchel':
      return (
        <group>
          <mesh position={[0, -hh / 2 - 0.25, 0]} rotation={[0, 0, 0.75]} material={mats.joint}>
            <torusGeometry args={[0.42, 0.018, 6, 30, Math.PI * 0.62]} />
          </mesh>
        </group>
      )
    case 'scarf':
      return (
        <mesh position={[0, -hh / 2 - 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} material={accent}>
          <torusGeometry args={[0.2, 0.05, 10, 28]} />
        </mesh>
      )
    case 'spark':
      return (
        <mesh position={[0.2, hh / 2 + 0.05, hd / 2 - 0.05]} rotation={[0, 0, Math.PI / 4]} material={accent}>
          <octahedronGeometry args={[0.05, 0]} />
        </mesh>
      )
    default:
      return null
  }
}

export const Robot = memo(RobotImpl)
