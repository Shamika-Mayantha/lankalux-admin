import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { DriverPackLogo } from '@/components/driver-pack/DriverPackLogo'
import { DOC } from '@/lib/driver-pack/lankaluxDocumentTheme'
import type { DriverPackData } from '@/lib/driver-pack/buildDriverPackData'

const styles = StyleSheet.create({
  page: {
    backgroundColor: DOC.background,
    color: DOC.forest,
    fontFamily: DOC.fontDisplay,
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 32,
  },
  sheet: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  top: {
    width: '100%',
    alignItems: 'center',
  },
  motto: {
    marginTop: 10,
    fontFamily: DOC.fontDisplay,
    fontSize: 16,
    letterSpacing: 3.2,
    color: DOC.forest,
    fontWeight: 600,
    textAlign: 'center',
  },
  rule: {
    width: 220,
    height: 2,
    backgroundColor: DOC.gold,
  },
  welcome: {
    fontFamily: DOC.fontDisplay,
    fontSize: 36,
    letterSpacing: 3.4,
    color: DOC.forest,
    fontWeight: 700,
    textAlign: 'center',
  },
  names: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },
  guest: {
    fontFamily: DOC.fontDisplay,
    fontWeight: 700,
    color: DOC.forest,
    textAlign: 'center',
    letterSpacing: 1.4,
    lineHeight: 1.05,
  },
  amp: {
    fontFamily: DOC.fontDisplay,
    fontSize: 28,
    color: DOC.forest,
    textAlign: 'center',
    marginVertical: 4,
    fontWeight: 600,
  },
})

function guestFontSize(count: number) {
  if (count <= 1) return 88
  if (count === 2) return 72
  return 48
}

export function PagingBoardDocument({ data, logoSrc }: { data: DriverPackData; logoSrc: string | null }) {
  const names = data.guestNames.length ? data.guestNames : [data.guestName]
  const nameSize = guestFontSize(names.length)
  return (
    <Document title={`LankaLux Paging Board — ${data.guestName}`} author="LankaLux" subject="Airport paging board">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.sheet}>
          <View style={styles.top}>
            <DriverPackLogo src={logoSrc} height={118} maxWidth={640} align="center" />
            <Text style={styles.motto}>{DOC.tagline.toUpperCase()}</Text>
          </View>
          <View style={styles.rule} />
          <Text style={styles.welcome}>WELCOME TO SRI LANKA</Text>
          <View style={styles.names}>
            {names.map((name, index) => (
              <View key={`${name}-${index}`} style={{ alignItems: 'center', width: '100%' }}>
                {index > 0 ? <Text style={styles.amp}>&</Text> : null}
                <Text style={[styles.guest, { fontSize: nameSize }]}>{name.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  )
}
