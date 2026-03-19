/**
 * Fleet vehicle options for itinerary send.
 * Images are served from /Fleet/ (place Fleet folder in public/Fleet).
 */

export interface FleetVehicle {
  id: string
  name: string
  description: string
  images: string[]
}

export const FLEET_VEHICLES: FleetVehicle[] = [
  {
    id: 'sedan',
    name: 'Sedan',
    description: 'Comfortable sedan for city transfers and short trips. Ideal for couples or small groups with standard luggage.',
    images: ['/Fleet/sedan1.jpg', '/Fleet/sedan2.jpg', '/Fleet/sedan3.jpg'],
  },
  {
    id: 'voxy',
    name: 'Toyota Voxy',
    description: 'Spacious 7-seater van perfect for families and small groups. Ample legroom and luggage space for a relaxed journey.',
    images: ['/Fleet/voxy1.jpg', '/Fleet/voxy2.jpg', '/Fleet/voxy3.jpg'],
  },
  {
    id: 'partybus',
    name: 'Party Bus',
    description: 'Luxury party bus for celebrations and group travel. Premium sound and interior for an unforgettable experience.',
    images: ['/Fleet/partybus1.jpg', '/Fleet/partybus2.jpg', '/Fleet/partybus3.jpg'],
  },
  {
    id: 'flatroof',
    name: 'Flat Roof Van',
    description: 'High-capacity van with flat roof for extra luggage. Great for longer trips and groups with more baggage.',
    images: ['/Fleet/flatroof1.jpg', '/Fleet/flatroof2.jpg', '/Fleet/flatroof3.jpg'],
  },
  {
    id: 'highroof',
    name: 'High Roof Van',
    description: 'Standing-height high roof van for maximum comfort on longer journeys. Ideal for safari and adventure trips.',
    images: ['/Fleet/highroof1.jpg', '/Fleet/highroof2.jpg', '/Fleet/highroof3.jpg'],
  },
  {
    id: 'safarijeep',
    name: 'Safari Jeep',
    description: 'Open safari jeep for wildlife and national park tours. Designed for the best game-viewing experience in Yala and beyond.',
    images: ['/Fleet/safarijeep.jpg'],
  },
]

export function getFleetVehicleById(id: string): FleetVehicle | undefined {
  return FLEET_VEHICLES.find((v) => v.id === id)
}

/** All unique image paths from the fleet folder (for photo picker). */
export function getAllFleetImages(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of FLEET_VEHICLES) {
    for (const src of v.images) {
      if (!seen.has(src)) {
        seen.add(src)
        out.push(src)
      }
    }
  }
  return out.sort()
}
