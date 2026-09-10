import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { DriverPackLogo } from '@/components/driver-pack/DriverPackLogo'
import { DOC } from '@/lib/driver-pack/lankaluxDocumentTheme'
import type { DriverPackData } from '@/lib/driver-pack/buildDriverPackData'

const COLS = [
  { key: 'date', label: 'DATE', width: '11%' },
  { key: 'route', label: 'ROUTE / DUTY', width: '22%' },
  { key: 'start', label: 'START TIME', width: '8%' },
  { key: 'end', label: 'END TIME', width: '8%' },
  { key: 'odoS', label: 'ODOMETER START', width: '9%' },
  { key: 'odoE', label: 'ODOMETER END', width: '9%' },
  { key: 'km', label: 'TOTAL KM', width: '7%' },
  { key: 'park', label: 'PARKING / TOLLS', width: '8%' },
  { key: 'stay', label: 'DRIVER ACCOMM.', width: '9%' },
  { key: 'remarks', label: 'REMARKS', width: '5%' },
  { key: 'sign', label: 'DRIVER SIGN', width: '4%' },
] as const

const styles = StyleSheet.create({
  page: {
    backgroundColor: DOC.background,
    color: DOC.forest,
    fontFamily: DOC.fontBody,
    fontSize: 9,
    paddingTop: 28,
    paddingBottom: 36,
    paddingHorizontal: 28,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: DOC.gold,
    paddingBottom: 10,
    marginBottom: 12,
  },
  kicker: {
    fontFamily: DOC.fontDisplay,
    fontSize: 8,
    letterSpacing: 2.2,
    color: DOC.gold,
    fontWeight: 600,
    marginTop: 8,
  },
  title: {
    fontFamily: DOC.fontDisplay,
    fontSize: 16,
    fontWeight: 600,
    color: DOC.forest,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 9,
    color: DOC.muted,
    marginTop: 2,
  },
  submit: {
    fontSize: 8,
    color: DOC.muted,
    marginTop: 3,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  metaItem: {
    width: '33%',
    paddingRight: 8,
    paddingBottom: 6,
  },
  metaWide: {
    width: '50%',
    paddingRight: 8,
    paddingBottom: 6,
  },
  label: {
    fontSize: 7,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: DOC.gold,
    fontWeight: 600,
    marginBottom: 2,
  },
  value: {
    fontFamily: DOC.fontDisplay,
    fontSize: 10,
    fontWeight: 600,
    color: DOC.forest,
  },
  blank: {
    borderBottomWidth: 1,
    borderBottomColor: DOC.borderSoft,
    minHeight: 14,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: DOC.cream,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: DOC.gold,
  },
  th: {
    fontSize: 6.2,
    letterSpacing: 0.4,
    color: DOC.forest,
    fontWeight: 600,
    padding: 4,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: DOC.borderSoft,
    minHeight: 26,
  },
  td: {
    padding: 4,
    fontSize: 7.5,
    color: DOC.forest,
  },
  summary: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: DOC.gold,
    padding: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  summaryLabel: {
    width: '42%',
    fontSize: 8,
    color: DOC.muted,
  },
  summaryLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: DOC.borderSoft,
  },
  approval: {
    marginTop: 14,
  },
  approvalRow: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 16,
  },
  approvalItem: {
    flex: 1,
  },
  footer: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7.5,
    color: DOC.muted,
  },
})

export function DriverLogDocument({ data, logoSrc }: { data: DriverPackData; logoSrc: string | null }) {
  return (
    <Document title={`LankaLux Driver Log — ${data.guestName}`} author="LankaLux" subject="Chauffeur / Driver Log Sheet">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <DriverPackLogo src={logoSrc} height={42} maxWidth={240} align="center" />
          <Text style={styles.kicker}>LANKALUX OPERATIONS</Text>
          <Text style={styles.title}>CHAUFFEUR / DRIVER LOG SHEET</Text>
          <Text style={styles.subtitle}>Trip Mileage, Route & Expense Record</Text>
          <Text style={styles.submit}>For submission to LankaLux operations</Text>
        </View>

        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Guest Name</Text>
            <Text style={styles.value}>{data.guestName}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Travel Dates</Text>
            <Text style={styles.value}>{data.travelDatesLabel}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Chauffeur-Guide</Text>
            <Text style={styles.value}>{data.chauffeurName}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Vehicle</Text>
            <Text style={styles.value}>{data.vehicleName}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Registration No</Text>
            <Text style={styles.value}>{data.vehicleRegistration}</Text>
          </View>
          <View style={styles.metaWide}>
            <Text style={styles.label}>Starting Mileage</Text>
            <View style={styles.blank} />
          </View>
          <View style={styles.metaWide}>
            <Text style={styles.label}>Closing Mileage</Text>
            <View style={styles.blank} />
          </View>
        </View>

        <View style={styles.tableHead} fixed>
          {COLS.map((col) => (
            <Text key={col.key} style={[styles.th, { width: col.width }]}>
              {col.label}
            </Text>
          ))}
        </View>
        {data.logRows.map((row) => (
          <View key={`${row.dateLabel}-${row.routeDuty}`} style={styles.row} wrap={false}>
            <Text style={[styles.td, { width: '11%' }]}>{row.dateLabel}</Text>
            <Text style={[styles.td, { width: '22%' }]}>{row.routeDuty}</Text>
            <Text style={[styles.td, { width: '8%' }]} />
            <Text style={[styles.td, { width: '8%' }]} />
            <Text style={[styles.td, { width: '9%' }]} />
            <Text style={[styles.td, { width: '9%' }]} />
            <Text style={[styles.td, { width: '7%' }]} />
            <Text style={[styles.td, { width: '8%' }]} />
            <Text style={[styles.td, { width: '9%' }]} />
            <Text style={[styles.td, { width: '5%' }]} />
            <Text style={[styles.td, { width: '4%' }]} />
          </View>
        ))}

        <View style={styles.summary} wrap={false}>
          <Text style={[styles.label, { marginBottom: 8 }]}>Expense & mileage summary</Text>
          {[
            'Total Trip Kilometers',
            'Advance Received',
            'Driver Accommodation Total',
            'Parking / Toll Total',
            'Other Expenses',
            'Total Expenses',
            'Balance / Settlement',
          ].map((label) => (
            <View key={label} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{label}:</Text>
              <View style={styles.summaryLine} />
            </View>
          ))}
        </View>

        <View style={styles.approval} wrap={false}>
          <View style={styles.approvalRow}>
            <View style={styles.approvalItem}>
              <Text style={styles.label}>Submitted by Driver</Text>
              <View style={styles.blank} />
            </View>
            <View style={styles.approvalItem}>
              <Text style={styles.label}>Date</Text>
              <View style={styles.blank} />
            </View>
          </View>
          <View style={styles.approvalRow}>
            <View style={styles.approvalItem}>
              <Text style={styles.label}>Checked by LankaLux</Text>
              <View style={styles.blank} />
            </View>
            <View style={{ flex: 2 }}>
              <Text style={styles.label}>Remarks</Text>
              <View style={styles.blank} />
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>LankaLux chauffeur log — fuel is not recorded on this sheet</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
