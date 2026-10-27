import * as THREE from 'three'

/**
 * Shared materials for the Headquarters. Made once and reused by every mesh, so the GPU
 * switches materials as little as possible. White ceramic and brushed metal for the
 * robots, frosted ice-blue glass for the islands, and self-lit colours for lights and eyes.
 */

const cache = new Map<string, THREE.Material>()

function once<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined
  if (!m) {
    m = make()
    cache.set(key, m)
  }
  return m
}

export const mats = {
  /** Robot shells: glossy white ceramic. */
  get shell() {
    return once('shell', () => new THREE.MeshPhysicalMaterial({ color: '#f8fbff', roughness: 0.32, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.18, sheen: 0.3, sheenColor: new THREE.Color('#dff3ff') }))
  },
  /** Joints, rails and small parts: soft brushed silver-blue. */
  get joint() {
    return once('joint', () => new THREE.MeshStandardMaterial({ color: '#c9d9e6', roughness: 0.38, metalness: 0.55 }))
  },
  /** Robot face screens: deep navy glass. */
  get face() {
    return once('face', () => new THREE.MeshPhysicalMaterial({ color: '#0c1a2c', roughness: 0.12, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }))
  },
  /** Desk monitors and tablets. */
  get screen() {
    return once('screen', () => new THREE.MeshPhysicalMaterial({ color: '#13283f', roughness: 0.15, metalness: 0.25, clearcoat: 1, emissive: new THREE.Color('#1b4b6e'), emissiveIntensity: 0.35 }))
  },
  get visor() {
    return once('visor', () => new THREE.MeshPhysicalMaterial({ color: '#9fdcff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, clearcoat: 1 }))
  },
  get blush() {
    return once('blush', () => new THREE.MeshBasicMaterial({ color: '#ff9fb8', transparent: true, opacity: 0.55 }))
  },
  get ghost() {
    return once('ghost', () => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }))
  },
  /** Island tops: warm white stone with a satin finish. */
  get deck() {
    return once('deck', () => new THREE.MeshStandardMaterial({ color: '#fbfdff', roughness: 0.55, metalness: 0.02 }))
  },
  /** Inner floor inlay. */
  get inlay() {
    return once('inlay', () => new THREE.MeshStandardMaterial({ color: '#eaf4fb', roughness: 0.4, metalness: 0.05 }))
  },
  /** Island undersides: frosted ice glass. */
  get under() {
    return once('under', () => new THREE.MeshPhysicalMaterial({ color: '#d9f0fb', roughness: 0.3, metalness: 0, transparent: true, opacity: 0.9, clearcoat: 0.6, sheen: 0.6, sheenColor: new THREE.Color('#ffffff'), emissive: new THREE.Color('#bfe6fa'), emissiveIntensity: 0.35 }))
  },
  /** Glass panes, walkways and the tower core. */
  get glass() {
    return once('glass', () => new THREE.MeshPhysicalMaterial({ color: '#d8f1ff', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.38, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }))
  },
  get furniture() {
    return once('furniture', () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.4, clearcoat: 0.5 }))
  },
  get cushion() {
    return once('cushion', () => new THREE.MeshStandardMaterial({ color: '#dceef9', roughness: 0.85 }))
  },
  get wood() {
    return once('wood', () => new THREE.MeshStandardMaterial({ color: '#e9dccb', roughness: 0.7 }))
  },
  get leaf() {
    return once('leaf', () => new THREE.MeshStandardMaterial({ color: '#8fd3b6', roughness: 0.75 }))
  },
  get tyre() {
    return once('tyre', () => new THREE.MeshStandardMaterial({ color: '#2b3a4a', roughness: 0.8 }))
  },
  /** A coloured, gently self-lit part (chest lights, accessories). */
  accent(color: string) {
    return once(`accent:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15, emissive: new THREE.Color(color), emissiveIntensity: 0.28 }))
  },
  /** Pure light: eyes, LEDs, rim strips (not tone mapped, so it reads as glowing). */
  glow(color: string) {
    return once(`glow:${color}`, () => new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 1 }))
  },
  glowDim(color: string) {
    return once(`glowDim:${color}`, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 }))
  },
  /** Soft additive pools of light on the floor. */
  floorGlow(color: string) {
    return once(`floor:${color}`, () =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, map: radialTexture(), toneMapped: false })
    )
  },
  /** Holographic panels. */
  holo(color: string) {
    return once(`holo:${color}`, () =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false })
    )
  },
}

let radial: THREE.Texture | null = null

/** A soft white dot fading to clear, drawn once on a canvas (used for glows and mist). */
export function radialTexture(): THREE.Texture {
  if (radial) return radial
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  radial = new THREE.CanvasTexture(canvas)
  radial.colorSpace = THREE.SRGBColorSpace
  return radial
}

/** A repeatable 0..1 number from a seed, so props vary between robots without random renders. */
export function seeded(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}
