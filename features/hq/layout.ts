import { botNode, GATEWAY, OWNER, type NodeKey } from '@/features/hq/engine'

/**
 * Where everything sits in the Headquarters and how each robot looks. One entry per agent:
 * a new agent row in ai_agents with no entry here still gets a plot on the outer ring and a
 * default robot, so the world never hides an agent that exists.
 */

export type RobotBody = 'round' | 'tall' | 'box' | 'capsule'
export type Accessory = 'halo' | 'headset' | 'bowtie' | 'visor' | 'tablet' | 'monocle' | 'satchel' | 'cap' | 'dish' | 'heart' | 'scarf' | 'spark' | 'none'
export type StationKind =
  | 'tower'
  | 'lounge'
  | 'frontdesk'
  | 'gate'
  | 'maptable'
  | 'ledger'
  | 'postoffice'
  | 'garage'
  | 'lookout'
  | 'boomerang'
  | 'meeting'
  | 'balcony'
  | 'portal'
  | 'annex'
  | 'plain'

export type RobotLook = { body: RobotBody; accent: string; accessory: Accessory; scale?: number }

export type Plot = {
  key: NodeKey
  /** Department name on the island. */
  title: string
  /** What the agent really does (from the agent service code). */
  role: string
  station: StationKind
  /** Island centre on the ground plane, and its height. */
  x: number
  z: number
  y: number
  radius: number
  robot?: RobotLook
}

export const ACCENT = {
  cyan: '#2cc4ea',
  green: '#22c98a',
  sky: '#4ea8ff',
  violet: '#8a7cff',
  teal: '#1fbfb4',
  gold: '#f0b44a',
  peach: '#ff9a72',
  orange: '#ff8a3d',
  ice: '#55d0ff',
  pink: '#ff6fa8',
  mint: '#5fd39c',
  coral: '#e9825e',
  amber: '#ffb020',
  red: '#ff4d5e',
}

const PLOTS: Plot[] = [
  {
    key: 'manager',
    title: 'Command tower',
    role: 'Routes every new event to the right agent, reviews customer messages before they go out, escalates to you and writes the daily summary.',
    station: 'tower',
    x: 0,
    z: 0,
    y: 0,
    radius: 5,
    robot: { body: 'tall', accent: ACCENT.cyan, accessory: 'halo', scale: 1.12 },
  },
  {
    key: 'sales',
    title: 'Sales lounge',
    role: 'Qualifies new leads and drafts WhatsApp replies. Asks the Travel Planner and Pricing for help, and keeps a trip sheet per chat.',
    station: 'lounge',
    x: -6.6,
    z: 8.8,
    y: 0.3,
    radius: 3.3,
    robot: { body: 'round', accent: ACCENT.green, accessory: 'headset' },
  },
  {
    key: 'concierge',
    title: 'Website front desk',
    role: 'Answers visitors in the lankalux.com chat and passes their trip details to the team as a new request. Runs inside admin, not on the agent server.',
    station: 'frontdesk',
    x: -15.2,
    z: 9.6,
    y: 0.9,
    radius: 2.7,
    robot: { body: 'capsule', accent: ACCENT.sky, accessory: 'bowtie' },
  },
  {
    key: 'quality',
    title: 'Quality gate',
    role: 'Checks every customer message and itinerary. A price, a promise or a claim to be human goes straight to you.',
    station: 'gate',
    x: 2.2,
    z: 11.4,
    y: -0.2,
    radius: 3.1,
    robot: { body: 'box', accent: ACCENT.violet, accessory: 'visor' },
  },
  {
    key: 'planner',
    title: 'Travel planning studio',
    role: 'Drafts itineraries with the existing LankaLux generator when Sales asks for one.',
    station: 'maptable',
    x: 11.8,
    z: 2.2,
    y: 0.4,
    radius: 3.4,
    robot: { body: 'tall', accent: ACCENT.teal, accessory: 'tablet' },
  },
  {
    key: 'pricing',
    title: 'Pricing desk',
    role: 'Works out price guides as internal notes on the request. It never quotes a customer.',
    station: 'ledger',
    x: 9.6,
    z: -7.6,
    y: -0.3,
    radius: 3.1,
    robot: { body: 'box', accent: ACCENT.gold, accessory: 'monocle' },
  },
  {
    key: 'followup',
    title: 'Follow-up post office',
    role: 'Finds leads that went quiet and drafts follow-ups: the first after 5 quiet days, a second 10 days later, then never.',
    station: 'postoffice',
    x: -11.4,
    z: -2.6,
    y: 0.2,
    radius: 3.1,
    robot: { body: 'round', accent: ACCENT.peach, accessory: 'satchel' },
  },
  {
    key: 'operations',
    title: 'Operations garage',
    role: 'Checks upcoming trips and request status changes so nothing is missed before a guest lands.',
    station: 'garage',
    x: -6.4,
    z: -12.2,
    y: -0.4,
    radius: 3.2,
    robot: { body: 'box', accent: ACCENT.orange, accessory: 'cap' },
  },
  {
    key: 'scout',
    title: 'Lead lookout',
    role: 'Searches public sources for people planning a Sri Lanka trip and saves the promising ones as leads.',
    station: 'lookout',
    x: 2.4,
    z: -15.4,
    y: 0.8,
    radius: 2.8,
    robot: { body: 'capsule', accent: ACCENT.ice, accessory: 'dish' },
  },
  {
    key: 'winback',
    title: 'Win-back corner',
    role: 'Finds past enquiries worth a friendly win-back email and drafts it for approval.',
    station: 'boomerang',
    x: 11.2,
    z: -17.6,
    y: 0.2,
    radius: 2.7,
    robot: { body: 'round', accent: ACCENT.pink, accessory: 'heart' },
  },
  {
    key: 'partners',
    title: 'Partner lounge',
    role: 'Plans outreach emails to hotels and travel partners after reading their websites.',
    station: 'meeting',
    x: -5.6,
    z: -22.4,
    y: 1.1,
    radius: 2.8,
    robot: { body: 'tall', accent: ACCENT.mint, accessory: 'scarf' },
  },
  {
    key: OWNER,
    title: 'Your balcony',
    role: 'Where approval requests come to you. Approving here uses the same approval check as the Approvals tab.',
    station: 'balcony',
    x: 10.4,
    z: 11.2,
    y: 0.6,
    radius: 2.9,
  },
  {
    key: GATEWAY,
    title: 'Customers and CRM',
    role: 'WhatsApp, email, the website chat and CRM changes arrive here, and approved messages leave from here.',
    station: 'portal',
    x: -21.6,
    z: 1.8,
    y: 0.4,
    radius: 3,
  },
]

/** The Claude annex: the weekly Claude bots, which run on your Claude plan rather than the agent server. */
export const ANNEX: Plot = {
  key: 'annex',
  title: 'Claude annex',
  role: 'Claude bots that run on a schedule on your Claude plan.',
  station: 'annex',
  x: 19.5,
  z: -13,
  y: 1.4,
  radius: 4.6,
}

/** Desk spots on the annex, in order of the bots list. */
export const ANNEX_SEATS: [number, number][] = [
  [-1.9, -1.2],
  [1.2, -1.9],
  [-1.2, 1.9],
  [1.9, 1.2],
]

export const BOT_LOOK: RobotLook = { body: 'round', accent: ACCENT.coral, accessory: 'spark', scale: 0.78 }

/** Glass walkways between islands (the pulses fly above them, straight from desk to desk). */
export const BRIDGES: [NodeKey, NodeKey][] = [
  ['manager', 'sales'],
  ['manager', 'quality'],
  ['manager', 'planner'],
  ['manager', 'pricing'],
  ['manager', 'followup'],
  ['manager', 'operations'],
  ['sales', 'concierge'],
  ['concierge', GATEWAY],
  ['followup', GATEWAY],
  ['quality', OWNER],
  ['planner', OWNER],
  ['operations', 'scout'],
  ['scout', 'winback'],
  ['operations', 'partners'],
  ['pricing', 'scout'],
  ['pricing', 'annex'],
]

/** Free plots for agents added later (outer ring), so a new agent always has a home. */
const SPARE: [number, number][] = [
  [20, 6],
  [-17, -14],
  [17, -22],
  [-20, 15],
  [26, 2],
  [-14, -24],
]

const BY_KEY = new Map(PLOTS.map((p) => [p.key, p]))

export function plotFor(key: NodeKey, agentKeys: string[]): Plot {
  if (key === 'annex') return ANNEX
  const known = BY_KEY.get(key)
  if (known) return known
  const extras = agentKeys.filter((k) => !BY_KEY.has(k))
  const [x, z] = SPARE[Math.max(0, extras.indexOf(key)) % SPARE.length]
  return {
    key,
    title: 'New department',
    role: '',
    station: 'plain',
    x,
    z,
    y: 0,
    radius: 2.8,
    robot: { body: 'capsule', accent: ACCENT.cyan, accessory: 'none' },
  }
}

/** Every plot the world draws: the agents in the database, the balcony, the gateway and the annex. */
export function allPlots(agentKeys: string[]): Plot[] {
  return [...agentKeys.map((k) => plotFor(k, agentKeys)), BY_KEY.get(OWNER)!, BY_KEY.get(GATEWAY)!, ANNEX]
}

/** Where a robot stands on its island (a little behind the centre, facing the camera). */
export function robotSpot(plot: Plot): [number, number, number] {
  if (plot.station === 'tower') return [plot.x + 2.3, plot.y + 0.1, plot.z + 2.3]
  return [plot.x - 0.55, plot.y + 0.1, plot.z - 0.55]
}

/** Where a node is in the world, for pulses: the robot's chest, or the middle of a landmark. */
export function anchorFor(node: NodeKey, agentKeys: string[], botKeys: string[]): [number, number, number] {
  if (node.startsWith('bot:')) {
    const i = botKeys.findIndex((k) => botNode(k) === node)
    const [dx, dz] = ANNEX_SEATS[Math.max(0, i) % ANNEX_SEATS.length]
    return [ANNEX.x + dx, ANNEX.y + 1.3, ANNEX.z + dz]
  }
  const plot = plotFor(node, agentKeys)
  if (plot.robot) {
    const [x, y, z] = robotSpot(plot)
    return [x, y + 1.7, z]
  }
  return [plot.x, plot.y + 1.6, plot.z]
}
