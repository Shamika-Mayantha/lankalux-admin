'use client'

import { memo, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { QuadraticBezierLine } from '@react-three/drei'
import * as THREE from 'three'
import { radialTexture } from '@/features/hq/world/materials'
import { PULSE_MS } from '@/features/hq/format'

/**
 * Light travelling between two places: one per real hand-off, report, decision or message
 * that the playhead passes. Arcs over the islands, leaves a fading trail and ripples on arrival.
 */

export type Pulse = {
  id: string
  from: [number, number, number]
  to: [number, number, number]
  color: string
  /** performance.now() when it set off. */
  born: number
}

const TRAVEL = 0.75

export const Pulses = memo(function Pulses({ pulses }: { pulses: Pulse[] }) {
  return (
    <group>
      {pulses.map((p) => (
        <PulseArc key={p.id} pulse={p} />
      ))}
    </group>
  )
})

function PulseArc({ pulse }: { pulse: Pulse }) {
  const head = useRef<THREE.Group>(null)
  const ripple = useRef<THREE.Mesh>(null)
  const line = useRef<THREE.Mesh>(null)
  const { curve, mid } = useMemo(() => {
    const a = new THREE.Vector3(...pulse.from)
    const b = new THREE.Vector3(...pulse.to)
    const lift = Math.min(7, 2 + a.distanceTo(b) * 0.28)
    const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, lift, 0))
    return { curve: new THREE.QuadraticBezierCurve3(a, mid, b), mid }
  }, [pulse.from, pulse.to])
  const headMat = useMemo(() => new THREE.MeshBasicMaterial({ color: pulse.color, toneMapped: false, transparent: true }), [pulse.color])
  const haloMat = useMemo(
    () => new THREE.SpriteMaterial({ map: radialTexture(), color: pulse.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [pulse.color]
  )
  const rippleMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: pulse.color, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    [pulse.color]
  )

  useFrame(() => {
    const k = (performance.now() - pulse.born) / PULSE_MS
    const travel = Math.min(1, k / TRAVEL)
    const eased = travel < 0.5 ? 2 * travel * travel : 1 - Math.pow(-2 * travel + 2, 2) / 2
    if (head.current) {
      head.current.visible = k < TRAVEL + 0.02
      head.current.position.copy(curve.getPoint(eased))
    }
    if (line.current) {
      const m = line.current.material as THREE.Material & { opacity: number; dashOffset?: number }
      m.opacity = k < TRAVEL ? 0.75 : Math.max(0, 0.75 * (1 - (k - TRAVEL) / (1 - TRAVEL)))
      if (m.dashOffset !== undefined) m.dashOffset -= 0.02
    }
    if (ripple.current) {
      const r = k < TRAVEL ? 0 : (k - TRAVEL) / (1 - TRAVEL)
      ripple.current.visible = r > 0 && r < 1
      ripple.current.scale.setScalar(0.3 + r * 1.6)
      ;(ripple.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - r)
    }
  })

  return (
    <group>
      <QuadraticBezierLine
        ref={line as never}
        start={pulse.from}
        end={pulse.to}
        mid={[mid.x, mid.y, mid.z]}
        color={pulse.color}
        lineWidth={2.2}
        transparent
        opacity={0.75}
        dashed
        dashScale={6}
        dashSize={0.6}
        gapSize={0.35}
        depthWrite={false}
        toneMapped={false}
      />
      <group ref={head}>
        <mesh material={headMat}>
          <sphereGeometry args={[0.14, 16, 12]} />
        </mesh>
        <sprite material={haloMat} scale={[1.3, 1.3, 1]} />
      </group>
      <mesh ref={ripple} position={pulse.to} rotation={[-Math.PI / 2, 0, 0]} material={rippleMat} visible={false}>
        <ringGeometry args={[0.55, 0.62, 40]} />
      </mesh>
    </group>
  )
}
