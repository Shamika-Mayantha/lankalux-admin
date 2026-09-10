import { Document, Page, Text, View, StyleSheet, Link, Image } from '@react-pdf/renderer'
import { DriverPackLogo } from '@/components/driver-pack/DriverPackLogo'
import { DOC } from '@/lib/driver-pack/lankaluxDocumentTheme'
import { padDay, type DriverPackData } from '@/lib/driver-pack/buildDriverPackData'
import { classificationLabel } from '@/lib/driver-pack/routeHelpers'

const styles = StyleSheet.create({
  page: {
    backgroundColor: DOC.background,
    color: DOC.forest,
    fontFamily: DOC.fontBody,
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 42,
  },
  header: {
    borderBottomWidth: 1.5,
    borderBottomColor: DOC.gold,
    paddingBottom: 14,
    marginBottom: 16,
  },
  kicker: {
    fontFamily: DOC.fontDisplay,
    fontSize: 9,
    letterSpacing: 2.4,
    color: DOC.gold,
    fontWeight: 600,
    marginTop: 8,
  },
  title: {
    fontFamily: DOC.fontDisplay,
    fontSize: 22,
    fontWeight: 600,
    color: DOC.forest,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 10,
    color: DOC.muted,
    marginTop: 2,
  },
  meta: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metaItem: {
    width: '33%',
    paddingRight: 12,
    paddingBottom: 8,
  },
  metaLabel: {
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: DOC.gold,
    fontWeight: 600,
    marginBottom: 2,
  },
  metaValue: {
    fontFamily: DOC.fontDisplay,
    fontSize: 11,
    fontWeight: 600,
    color: DOC.forest,
  },
  dayCard: {
    borderWidth: 1,
    borderColor: DOC.borderSoft,
    backgroundColor: DOC.cream,
    padding: 14,
    marginBottom: 12,
  },
  dayKicker: {
    fontFamily: DOC.fontDisplay,
    fontSize: 9,
    letterSpacing: 2.6,
    color: DOC.gold,
    fontWeight: 700,
  },
  dayDate: {
    fontFamily: DOC.fontDisplay,
    fontSize: 11,
    color: DOC.muted,
    marginTop: 2,
    letterSpacing: 0.6,
  },
  dayRoute: {
    fontFamily: DOC.fontDisplay,
    fontSize: 15,
    fontWeight: 600,
    color: DOC.forest,
    marginTop: 4,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  col: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 8,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: DOC.gold,
    fontWeight: 600,
    marginBottom: 3,
  },
  placeName: {
    fontFamily: DOC.fontDisplay,
    fontSize: 11,
    fontWeight: 600,
    color: DOC.forest,
  },
  placeAddress: {
    fontSize: 9,
    color: DOC.muted,
    lineHeight: 1.45,
  },
  facts: {
    flexDirection: 'row',
    marginTop: 10,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: DOC.borderSoft,
    paddingTop: 8,
  },
  fact: {
    flex: 1,
    paddingRight: 8,
  },
  planItem: {
    fontSize: 10,
    color: DOC.forest,
    lineHeight: 1.45,
    marginBottom: 2,
  },
  stop: {
    marginBottom: 6,
  },
  stopHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  stopName: {
    fontFamily: DOC.fontDisplay,
    fontSize: 10,
    fontWeight: 600,
    color: DOC.forest,
  },
  stopClass: {
    fontSize: 7.5,
    letterSpacing: 0.8,
    color: DOC.gold,
    fontWeight: 600,
  },
  stopNote: {
    fontSize: 9,
    color: DOC.muted,
    lineHeight: 1.4,
  },
  detour: {
    color: '#8a2424',
  },
  hotelBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: DOC.gold,
    padding: 10,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: DOC.background,
  },
  hotelTitle: {
    fontSize: 8,
    letterSpacing: 1.8,
    color: DOC.gold,
    fontWeight: 600,
    marginBottom: 4,
  },
  specialBox: {
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: DOC.gold,
    paddingLeft: 10,
    paddingVertical: 4,
  },
  notes: {
    marginTop: 8,
  },
  note: {
    fontSize: 9,
    color: DOC.forest,
    lineHeight: 1.4,
    marginBottom: 2,
  },
  footer: {
    position: 'absolute',
    left: 42,
    right: 42,
    bottom: 22,
    borderTopWidth: 1,
    borderTopColor: DOC.borderSoft,
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 8,
    color: DOC.muted,
  },
  tbc: {
    color: DOC.muted,
    fontStyle: 'italic',
  },
})

function Val({ value }: { value: string }) {
  const tbc = /to be confirmed/i.test(value)
  return <Text style={tbc ? styles.tbc : undefined}>{value}</Text>
}

export function DriverJourneyDocument({ data, logoSrc }: { data: DriverPackData; logoSrc: string | null }) {
  return (
    <Document
      title={`LankaLux Driver Journey — ${data.guestName}`}
      author="LankaLux"
      subject="Chauffeur-Guide Operational Plan"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <DriverPackLogo src={logoSrc} height={38} maxWidth={200} />
          <Text style={styles.kicker}>INTERNAL OPERATIONS</Text>
          <Text style={styles.title}>DRIVER JOURNEY</Text>
          <Text style={styles.subtitle}>Chauffeur-Guide Operational Plan</Text>
          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Guest</Text>
              <Text style={styles.metaValue}>{data.guestName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Travel Dates</Text>
              <Text style={styles.metaValue}>{data.travelDatesLabel}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Chauffeur-Guide</Text>
              <Text style={styles.metaValue}>{data.chauffeurName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Vehicle</Text>
              <Text style={styles.metaValue}>{data.vehicleName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Registration</Text>
              <Text style={styles.metaValue}>{data.vehicleRegistration}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Arrival</Text>
              <Text style={styles.metaValue}>
                {data.arrivalFlight}
                {data.arrivalTime && data.arrivalTime !== 'TO BE CONFIRMED' ? ` · ${data.arrivalTime}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {data.days.map((day) => (
          <View key={`day-${day.dayNumber}-${day.date}`} style={styles.dayCard}>
            <Text style={styles.dayKicker}>DAY {padDay(day.dayNumber)}</Text>
            <Text style={styles.dayDate}>{day.longDate || day.dateLabel}</Text>
            <Text style={styles.dayRoute}>{day.from ? `${day.from.toUpperCase()} → ${day.to.toUpperCase()}` : day.routeLabel.toUpperCase()}</Text>

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.sectionLabel}>Start</Text>
                <Text style={styles.placeName}>{day.start.name}</Text>
                <Text style={styles.placeAddress}>{day.start.address}</Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.sectionLabel}>Destination</Text>
                <Text style={styles.placeName}>{day.destination.name}</Text>
                <Text style={styles.placeAddress}>{day.destination.address}</Text>
              </View>
            </View>

            <View style={styles.facts}>
              <View style={styles.fact}>
                <Text style={styles.sectionLabel}>Suggested Departure</Text>
                <Val value={day.suggestedDeparture} />
              </View>
              <View style={styles.fact}>
                <Text style={styles.sectionLabel}>Approximate Driving Time</Text>
                <Val value={day.drivingTime} />
              </View>
              <View style={styles.fact}>
                <Text style={styles.sectionLabel}>Approximate Distance</Text>
                <Val value={day.distance} />
              </View>
            </View>

            <Text style={styles.sectionLabel}>En-route plan</Text>
            {day.enRoutePlan.map((step, i) => (
              <Text key={`${day.dayNumber}-plan-${i}`} style={styles.planItem}>
                {i + 1}. {step}
              </Text>
            ))}

            {day.stops.length ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.sectionLabel}>En-route stops</Text>
                {day.stops.map((stop) => (
                  <View key={`${day.dayNumber}-${stop.name}`} style={styles.stop}>
                    <View style={styles.stopHead}>
                      <Text style={styles.stopName}>
                        {stop.name} · {stop.category}
                      </Text>
                    </View>
                    <Text style={[styles.stopClass, stop.classification === 'detour' ? styles.detour : {}]}>
                      {classificationLabel(stop.classification)}
                    </Text>
                    <Text style={styles.stopNote}>{stop.note}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {day.special?.kind === 'train' ? (
              <View style={styles.specialBox}>
                <Text style={styles.sectionLabel}>Train handover</Text>
                <Text style={styles.planItem}>Guest boarding station: {day.special.boarding}</Text>
                <Text style={styles.planItem}>Guest destination station: {day.special.destination}</Text>
                <Text style={styles.planItem}>
                  Train number: <Val value={day.special.trainNumber} />
                </Text>
                <Text style={styles.planItem}>
                  Train time: <Val value={day.special.trainTime} />
                </Text>
                {day.special.notes.map((note) => (
                  <Text key={note} style={styles.note}>
                    • {note}
                  </Text>
                ))}
              </View>
            ) : null}

            {day.special?.kind === 'safari' ? (
              <View style={styles.specialBox}>
                <Text style={styles.sectionLabel}>Safari operation</Text>
                <Text style={styles.planItem}>Safari park: {day.special.park}</Text>
                <Text style={styles.planItem}>
                  Expected start: <Val value={day.special.start} />
                </Text>
                <Text style={styles.planItem}>
                  Expected finish: <Val value={day.special.finish} />
                </Text>
                <Text style={styles.note}>• {day.special.jeep}</Text>
                <Text style={styles.note}>• {day.special.wait}</Text>
                <Text style={styles.note}>• {day.special.reconnect}</Text>
              </View>
            ) : null}

            {day.hotel ? (
              <View style={styles.hotelBox}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hotelTitle}>Tonight's hotel</Text>
                  <Text style={styles.placeName}>{day.hotel.name}</Text>
                  <Text style={styles.placeAddress}>{day.hotel.address}</Text>
                  {day.hotel.mapsUrl ? (
                    <Link src={day.hotel.mapsUrl} style={{ fontSize: 9, color: DOC.gold, marginTop: 4 }}>
                      Open in Maps
                    </Link>
                  ) : null}
                </View>
                {day.hotel.qrDataUrl ? (
                  <Image src={day.hotel.qrDataUrl} style={{ width: 58, height: 58 }} />
                ) : null}
              </View>
            ) : null}

            <View style={styles.notes}>
              <Text style={styles.sectionLabel}>Driver notes</Text>
              {day.driverNotes.map((note) => (
                <Text key={note} style={styles.note}>
                  • {note}
                </Text>
              ))}
            </View>
          </View>
        ))}

        {data.notes ? (
          <View style={styles.dayCard}>
            <Text style={styles.sectionLabel}>Internal notes</Text>
            <Text style={styles.placeAddress}>{data.notes}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>LankaLux internal operations — not a client itinerary</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
