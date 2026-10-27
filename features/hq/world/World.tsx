'use client'

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { AdaptiveDpr, CameraControls, Environment, Html, Lightformer, PerformanceMonitor, Sparkles } from '@react-three/drei'
import { botNode, GATEWAY, OWNER, STATE_LABEL, type AgentState, type AgentView, type NodeKey } from '@/features/hq/engine'
import { ACCENT, ANNEX, ANNEX_SEATS, BOT_LOOK, BRIDGES, allPlots, anchorFor, robotSpot, type Plot } from '@/features/hq/layout'
import { Bridge, Console, HoloScreen, Island, Mist } from '@/features/hq/world/Island'
import { Pulses, type Pulse } from '@/features/hq/world/Pulses'
import { Robot } from '@/features/hq/world/Robot'
import { Station } from '@/features/hq/world/Stations'

/** The camera's home: a three-quarter view from the front-right, framing every island. */
const HOME_AZIMUTH = Math.PI / 4
const HOME_POLAR = 0.92
/** Robots face the camera's side of the world. */
const FACING = Math.PI / 4
/** Robots are drawn larger than life next to their islands, so you can read their faces. */
export const ROBOT_SCALE = 1.55

export type Quality = 'high' | 'medium'

export type WorldHandle = { focus: (node: NodeKey | null) => void; home: () => void }

export type WorldProps = {
  agentKeys: string[]
  botKeys: string[]
  names: Record<NodeKey, string>
  views: Map<NodeKey, AgentView>
  /** What each holo screen says (the real current task, or a quiet line). */
  screens: Record<NodeKey, string>
  pulses: Pulse[]
  pendingForOwner: number
  selected: NodeKey | null
  onSelect: (node: NodeKey | null) => void
  quality: Quality
  onQualityDrop: () => void
  reducedMotion: boolean
}

export const World = memo(
  forwardRef<WorldHandle, WorldProps>(function World(props, ref) {
    const controls = useRef<CameraControls>(null)
    const { agentKeys } = props
    const plots = useMemo(() => allPlots(agentKeys), [agentKeys])
    const byKey = useMemo(() => new Map(plots.map((p) => [p.key, p])), [plots])

    // Frames the whole headquarters whatever the screen shape (wide desktop or tall phone):
    // from a fixed three-quarter angle, find the distance at which every island fits.
    const home = useCallback(
      (smooth: boolean) => {
        const c = controls.current
        const cam = c?.camera as THREE.PerspectiveCamera | undefined
        if (!c || !cam) return
        const pts: THREE.Vector3[] = []
        // On a tall phone screen, frame the command tower and its neighbours; the rest is a swipe away.
        const shown = cam.aspect < 1 ? [{ x: 0, y: 0, z: 2, radius: 8, station: 'plain' as const }] : plots
        for (const p of shown) {
          for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            pts.push(new THREE.Vector3(p.x + dx * p.radius, p.y - 2.4, p.z + dz * p.radius))
            pts.push(new THREE.Vector3(p.x + dx * p.radius, p.y + (p.station === 'tower' ? 8 : 3.2), p.z + dz * p.radius))
          }
        }
        const dir = new THREE.Vector3().setFromSphericalCoords(1, HOME_POLAR, HOME_AZIMUTH)
        const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize()
        const up = dir.clone().cross(right).normalize()
        const target = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3())
        // Centre the drawing on screen, then nudge it up clear of the timeline at the bottom.
        let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
        for (const p of pts) {
          const rel = p.clone().sub(target)
          x0 = Math.min(x0, rel.dot(right))
          x1 = Math.max(x1, rel.dot(right))
          y0 = Math.min(y0, rel.dot(up))
          y1 = Math.max(y1, rel.dot(up))
        }
        target.addScaledVector(right, (x0 + x1) / 2).addScaledVector(up, (y0 + y1) / 2 - (y1 - y0) * 0.07)
        const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 0.84
        const tanH = tanV * cam.aspect
        let dist = 10
        for (const p of pts) {
          const rel = p.clone().sub(target)
          const depth = rel.dot(dir)
          dist = Math.max(dist, depth + Math.abs(rel.dot(right)) / tanH, depth + Math.abs(rel.dot(up)) / tanV)
        }
        const pos = target.clone().addScaledVector(dir, dist * 1.02)
        c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, smooth)
      },
      [plots]
    )
    /** Once you move the camera yourself, resizing the window no longer re-frames it. */
    const touched = useRef(false)

    useImperativeHandle(ref, () => ({
      focus(node) {
        const c = controls.current
        if (!c) return
        touched.current = !!node
        if (!node) {
          home(true)
          return
        }
        // Look at it from the same angle, shifted so it sits left of the panel that opens on the right.
        const [x, y, z] = anchorFor(node, agentKeys, props.botKeys)
        const side = window.innerWidth > 760 ? 3.2 : 0
        const tx = x + side * Math.SQRT1_2
        const tz = z - side * Math.SQRT1_2
        const lower = window.innerWidth > 760 ? 0 : -2.5
        c.setLookAt(tx + 13, y + 12, tz + 13, tx, y + lower, tz, true)
      },
      home() {
        touched.current = false
        home(true)
      },
    }))

    const high = props.quality === 'high'
    return (
      <Canvas
        shadows={high ? 'soft' : false}
        dpr={high ? [1, 2] : [1, 1.25]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [30, 28, 30], fov: 30, near: 1, far: 300 }}
        onPointerMissed={() => props.onSelect(null)}
        frameloop={props.reducedMotion ? 'demand' : 'always'}
      >
        <PerformanceMonitor onDecline={props.onQualityDrop} flipflops={2} />
        <AdaptiveDpr pixelated={false} />
        <fog attach="fog" args={['#e6f2fa', 90, 220]} />
        <hemisphereLight args={['#ffffff', '#bcdcf0', 1.05]} />
        <ambientLight intensity={0.25} />
        <directionalLight
          position={[22, 34, 14]}
          intensity={2.1}
          color="#fffaf2"
          castShadow={high}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-38}
          shadow-camera-right={38}
          shadow-camera-top={38}
          shadow-camera-bottom={-38}
          shadow-camera-near={5}
          shadow-camera-far={90}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
        />
        <directionalLight position={[-20, 12, -18]} intensity={0.45} color="#cfe9ff" />
        <Environment resolution={128} frames={1}>
          <Lightformer intensity={2.2} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
          <Lightformer intensity={1.2} position={[10, 3, 8]} scale={[10, 4, 1]} color="#dff4ff" />
          <Lightformer intensity={0.8} position={[-10, 2, -6]} scale={[10, 4, 1]} color="#ffffff" />
        </Environment>

        <AutoFrame home={home} touched={touched} />
        <CameraControls
          ref={controls}
          onStart={() => {
            touched.current = true
          }}
          makeDefault
          minDistance={10}
          maxDistance={140}
          minPolarAngle={0.35}
          maxPolarAngle={1.2}
          smoothTime={0.55}
          draggingSmoothTime={0.12}
          dollySpeed={0.6}
          truckSpeed={1.4}
        />

        <group>
          {BRIDGES.map(([a, b]) => {
            const pa = byKey.get(a)
            const pb = byKey.get(b)
            return pa && pb ? <Bridge key={`${a}-${b}`} a={pa} b={pb} /> : null
          })}
          {plots.map((plot) => (
            <PlotView key={plot.key} plot={plot} {...props} />
          ))}
        </group>

        <Pulses pulses={props.pulses} />
        <Mist count={high ? 22 : 12} />
        <Sparkles count={high ? 90 : 40} scale={[70, 14, 70]} position={[0, 4, -4]} size={2.2} speed={props.reducedMotion ? 0 : 0.25} color="#a8e6ff" opacity={0.6} />
      </Canvas>
    )
  })
)

/** Frames the headquarters when the canvas first gets its size, and again on resize until you move the camera. */
function AutoFrame({ home, touched }: { home: (smooth: boolean) => void; touched: React.MutableRefObject<boolean> }) {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  useEffect(() => {
    if (!touched.current && width > 0 && height > 0) home(false)
  }, [width, height, home, touched])
  return null
}

const ACTIVE: AgentState[] = ['working', 'thinking']

const PlotView = memo(function PlotView({
  plot,
  views,
  names,
  screens,
  selected,
  onSelect,
  pendingForOwner,
  reducedMotion,
  botKeys,
}: { plot: Plot } & WorldProps) {
  const view = views.get(plot.key)
  const accent = plot.robot?.accent ?? (plot.key === 'annex' ? ACCENT.coral : plot.key === OWNER ? ACCENT.amber : ACCENT.cyan)
  const active = plot.key === 'annex' ? botKeys.some((k) => ACTIVE.includes(views.get(botNode(k))?.state ?? 'idle')) : ACTIVE.includes(view?.state ?? 'idle')
  const spot = plot.robot ? robotSpot(plot) : null
  const local = spot ? ([spot[0] - plot.x, spot[1] - plot.y, spot[2] - plot.z] as [number, number, number]) : null

  return (
    <>
      <Island plot={plot} accent={accent}>
        <Station plot={plot} accent={accent} active={active} pending={pendingForOwner} />
        {local && (
          // Console in front of the robot and holo screen to its left, sized with the robot.
          <group position={local} scale={ROBOT_SCALE}>
            <Console accent={accent} position={[0.5, -0.1, 0.5]} rotationY={FACING + Math.PI} />
            <HoloScreen title={plot.title} line={screens[plot.key] || ''} accent={accent} active={active} position={[0.92, 1.7, -0.92]} rotationY={FACING - 0.35} />
          </group>
        )}
        {!plot.robot && plot.key !== 'annex' && (
          <Html position={[0, plot.key === GATEWAY ? 4.4 : 2.6, 0]} center zIndexRange={[20, 0]} className="hq-place-wrap">
            <button type="button" className={`hq-place ${plot.key === OWNER && pendingForOwner ? 'alert' : ''}`} onClick={(e) => {
              // Keep the click from reaching the canvas, which would read it as a click on empty space.
              e.stopPropagation()
              onSelect(plot.key)
            }}>
              {plot.title}
              {plot.key === OWNER && pendingForOwner > 0 && <b>{pendingForOwner}</b>}
            </button>
          </Html>
        )}
        {plot.key === 'annex' && (
          <Html position={[0, 3.4, 0]} center zIndexRange={[20, 0]} className="hq-place-wrap">
            <span className="hq-place quiet">{plot.title}</span>
          </Html>
        )}
      </Island>

      {spot && plot.robot && (
        <>
          <Robot
            look={{ ...plot.robot, scale: (plot.robot.scale ?? 1) * ROBOT_SCALE }}
            state={view?.state ?? 'idle'}
            position={spot}
            facing={FACING}
            selected={selected === plot.key}
            reducedMotion={reducedMotion}
            onSelect={() => onSelect(plot.key)}
          />
          <Tag node={plot.key} name={names[plot.key] || plot.title} view={view} position={[spot[0], spot[1] + 2.15 * (plot.robot.scale ?? 1) * ROBOT_SCALE, spot[2]]} selected={selected === plot.key} onSelect={onSelect} />
        </>
      )}

      {plot.key === 'annex' &&
        botKeys.map((k, i) => {
          const [dx, dz] = ANNEX_SEATS[i % ANNEX_SEATS.length]
          const pos: [number, number, number] = [ANNEX.x + dx, ANNEX.y + 0.05, ANNEX.z + dz]
          const node = botNode(k)
          return (
            <group key={k}>
              <Robot look={{ ...BOT_LOOK, scale: (BOT_LOOK.scale ?? 1) * ROBOT_SCALE }} state={views.get(node)?.state ?? 'idle'} position={pos} facing={FACING} selected={selected === node} reducedMotion={reducedMotion} onSelect={() => onSelect(node)} />
              {/* Four bots share one island: name tags only while one is busy or picked. */}
              {(selected === node || (views.get(node)?.state ?? 'idle') !== 'idle') && (
                <Tag node={node} name={names[node] || k} view={views.get(node)} position={[pos[0], pos[1] + 1.8 * ROBOT_SCALE, pos[2]]} selected={selected === node} onSelect={onSelect} small />
              )}
            </group>
          )
        })}
    </>
  )
})

/** The name chip over a robot: name, a state light, and "Needs you" when an approval waits. */
const Tag = memo(function Tag({
  node,
  name,
  view,
  position,
  selected,
  onSelect,
  small,
}: {
  node: NodeKey
  name: string
  view: AgentView | undefined
  position: [number, number, number]
  selected: boolean
  onSelect: (n: NodeKey) => void
  small?: boolean
}) {
  const state = view?.state ?? 'idle'
  const waiting = view?.waiting.length ?? 0
  return (
    <Html position={position} center zIndexRange={[30, 0]} className="hq-tag-wrap">
      <button
        type="button"
        className={`hq-tag s-${state} ${selected ? 'on' : ''} ${small ? 'small' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(node)
        }}
      >
        <i aria-hidden />
        <span>{name}</span>
        {waiting > 0 ? <em>Needs you · {waiting}</em> : state !== 'idle' && <small>{STATE_LABEL[state]}</small>}
      </button>
    </Html>
  )
})

