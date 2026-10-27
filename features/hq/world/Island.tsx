'use client'

import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import type { Plot } from '@/features/hq/layout'
import { mats, radialTexture, seeded } from '@/features/hq/world/materials'

/** A floating island: satin white deck, glowing rim, frosted ice underside and a slow halo below. */
export const Island = memo(function Island({ plot, accent, children }: { plot: Plot; accent: string; children?: React.ReactNode }) {
  const halo = useRef<THREE.Mesh>(null)
  const R = plot.radius
  useFrame((_, dt) => {
    if (halo.current) halo.current.rotation.z += dt * 0.15
  })
  return (
    <group position={[plot.x, plot.y, plot.z]}>
      {/* Deck */}
      <mesh position={[0, -0.13, 0]} material={mats.deck} receiveShadow castShadow>
        <cylinderGeometry args={[R, R * 0.985, 0.26, 72]} />
      </mesh>
      <mesh position={[0, 0.006, 0]} material={mats.inlay} receiveShadow>
        <cylinderGeometry args={[R * 0.74, R * 0.74, 0.012, 64]} />
      </mesh>
      <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.glowDim(accent)}>
        <ringGeometry args={[R * 0.74, R * 0.755, 72]} />
      </mesh>
      {/* Rim light */}
      <mesh position={[0, -0.05, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.glow(accent)}>
        <torusGeometry args={[R + 0.005, 0.022, 8, 96]} />
      </mesh>
      {/* Frosted underside */}
      <mesh position={[0, -1.1, 0]} material={mats.under}>
        <cylinderGeometry args={[R * 0.97, R * 0.34, 1.7, 64, 1, true]} />
      </mesh>
      <mesh position={[0, -2.25, 0]} material={mats.under}>
        <coneGeometry args={[R * 0.34, 0.6, 48]} />
      </mesh>
      {/* Anti-gravity halo */}
      <mesh ref={halo} position={[0, -2.15, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.glowDim(accent)}>
        <ringGeometry args={[R * 0.42, R * 0.45, 64, 1, 0, Math.PI * 1.6]} />
      </mesh>
      <mesh position={[0, -2.7, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.floorGlow(accent)}>
        <circleGeometry args={[R * 0.9, 32]} />
      </mesh>
      {children}
    </group>
  )
})

/** A glass walkway between two islands, with light rails along both edges. */
export const Bridge = memo(function Bridge({ a, b }: { a: Plot; b: Plot }) {
  const geo = useMemo(() => {
    const from = new THREE.Vector3(a.x, a.y, a.z)
    const to = new THREE.Vector3(b.x, b.y, b.z)
    const flat = new THREE.Vector3(to.x - from.x, 0, to.z - from.z)
    const dist = flat.length()
    const dir = flat.clone().normalize()
    const start = from.clone().addScaledVector(dir, a.radius - 0.15)
    const end = to.clone().addScaledVector(dir, -(b.radius - 0.15))
    const mid = start.clone().add(end).multiplyScalar(0.5)
    const len = start.distanceTo(end)
    const yaw = Math.atan2(dir.x, dir.z)
    const pitch = Math.atan2(end.y - start.y, Math.hypot(end.x - start.x, end.z - start.z))
    return { mid, len, yaw, pitch, ok: dist > a.radius + b.radius }
  }, [a, b])
  if (!geo.ok) return null
  return (
    <group position={[geo.mid.x, geo.mid.y - 0.06, geo.mid.z]} rotation={[0, geo.yaw, 0]}>
      <group rotation={[-geo.pitch, 0, 0]}>
        <mesh material={mats.glass} receiveShadow>
          <boxGeometry args={[0.95, 0.07, geo.len]} />
        </mesh>
        {[-0.47, 0.47].map((x) => (
          <mesh key={x} position={[x, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.glow('#8fe3ff')}>
            <cylinderGeometry args={[0.018, 0.018, geo.len, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  )
})

/**
 * A floating holographic screen that shows what the agent is really doing right now
 * (the task label from the agent tables), or that it is idle.
 */
export const HoloScreen = memo(function HoloScreen({
  title,
  line,
  accent,
  active,
  position,
  rotationY,
}: {
  title: string
  line: string
  accent: string
  active: boolean
  position: [number, number, number]
  rotationY: number
}) {
  const panel = useRef<THREE.Mesh>(null)
  // Redrawn only when the text changes (a task starts or ends), never per frame.
  const texture = useMemo(() => drawScreen(title, line, accent), [title, line, accent])
  useEffect(() => () => texture.dispose(), [texture])

  useFrame((frame) => {
    if (!panel.current) return
    const m = panel.current.material as THREE.MeshBasicMaterial
    const target = active ? 1 : 0.86
    m.opacity += (target - m.opacity) * 0.08
    panel.current.position.y = Math.sin(frame.clock.elapsedTime * 1.2 + position[0]) * 0.04
  })

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh ref={panel}>
        <planeGeometry args={[1.5, 0.88]} />
        <meshBasicMaterial map={texture} transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* Slim stand */}
      <mesh position={[0, -1.05, -0.02]} material={mats.joint}>
        <cylinderGeometry args={[0.025, 0.025, 1.25, 8]} />
      </mesh>
      <mesh position={[0, -1.66, -0.02]} material={mats.joint}>
        <cylinderGeometry args={[0.16, 0.2, 0.05, 20]} />
      </mesh>
    </group>
  )
})

function drawScreen(title: string, line: string, accent: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 300
  const ctx = canvas.getContext('2d')!
  // Frosted white glass card with a coloured edge.
  const g = ctx.createLinearGradient(0, 0, 0, 300)
  g.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  g.addColorStop(1, 'rgba(226, 244, 255, 0.9)')
  ctx.fillStyle = g
  roundRect(ctx, 6, 6, 500, 288, 34)
  ctx.fill()
  ctx.strokeStyle = accent
  ctx.lineWidth = 5
  roundRect(ctx, 6, 6, 500, 288, 34)
  ctx.stroke()
  ctx.fillStyle = accent
  roundRect(ctx, 6, 6, 500, 14, 7)
  ctx.fill()
  ctx.fillStyle = '#5b7690'
  ctx.font = '700 28px Inter, system-ui, sans-serif'
  ctx.fillText(title.toUpperCase(), 36, 72)
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(46, 133, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#0f2740'
  ctx.font = '600 42px Inter, system-ui, sans-serif'
  wrap(ctx, line, 72, 148, 410, 52, 3)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, lines: number) {
  const words = text.split(/\s+/)
  let line = ''
  let n = 0
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i]
    if (ctx.measureText(test).width > max && line) {
      if (n === lines - 1) {
        ctx.fillText(`${line}…`, x, y + n * lh)
        return
      }
      ctx.fillText(line, x, y + n * lh)
      line = words[i]
      n++
    } else line = test
  }
  if (line) ctx.fillText(line, x, y + n * lh)
}

/** The little floating console every robot works at. */
export function Console({ accent, position, rotationY }: { accent: string; position: [number, number, number]; rotationY: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <RoundedBox args={[0.9, 0.08, 0.42]} radius={0.04} smoothness={3} position={[0, 0.48, 0]} rotation={[0.25, 0, 0]} material={mats.furniture} castShadow />
      <mesh position={[0, 0.53, 0.0]} rotation={[-Math.PI / 2 + 0.25, 0, 0]} material={mats.holo(accent)}>
        <planeGeometry args={[0.7, 0.28]} />
      </mesh>
      <mesh position={[0, 0.22, -0.05]} material={mats.joint}>
        <cylinderGeometry args={[0.04, 0.08, 0.44, 12]} />
      </mesh>
      <mesh position={[0, 0.01, -0.05]} material={mats.joint}>
        <cylinderGeometry args={[0.2, 0.22, 0.03, 24]} />
      </mesh>
    </group>
  )
}

/** Drifting mist below the islands. */
export function Mist({ count }: { count: number }) {
  const group = useRef<THREE.Group>(null)
  const puffs = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + seeded(i) * 0.5
        const r = 6 + seeded(i + 100) * 26
        return { x: Math.cos(a) * r, z: Math.sin(a) * r - 4, y: -5.5 - seeded(i + 200) * 2.5, s: 9 + seeded(i + 300) * 10, speed: 0.02 + seeded(i + 400) * 0.04 }
      }),
    [count]
  )
  const material = useMemo(
    () => new THREE.SpriteMaterial({ map: radialTexture(), color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, fog: false }),
    []
  )
  useFrame((frame) => {
    group.current?.children.forEach((c, i) => {
      const p = puffs[i]
      c.position.x = p.x + Math.sin(frame.clock.elapsedTime * p.speed + i) * 2
    })
  })
  return (
    <group ref={group}>
      {puffs.map((p, i) => (
        <sprite key={i} position={[p.x, p.y, p.z]} scale={[p.s, p.s * 0.55, 1]} material={material} />
      ))}
    </group>
  )
}
