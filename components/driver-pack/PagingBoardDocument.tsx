import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { DriverPackLogo } from '@/components/driver-pack/DriverPackLogo'
import { DOC } from '@/lib/driver-pack/lankaluxDocumentTheme'
import type { DriverPackData } from '@/lib/driver-pack/buildDriverPackData'

const styles = StyleSheet.create({
  page: {
    backgroundColor: DOC.background,
    color: DOC.forest,
    fontFamily: DOC.fontDisplay,
    padding: 48,
  },
  frame: {
    flex: 1,
    borderWidth: 1,
    borderColor: DOC.borderSoft,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingVertical: 36,
  },
  inner: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rule: {
    width: 120,
    height: 1.5,
    backgroundColor: DOC.gold,
    marginVertical: 18,
  },
  tagline: {
    marginTop: 10,
    fontFamily: DOC.fontBody,
    fontSize: 11,
    letterSpacing: 1.6,
    color: DOC.muted,
    textAlign: 'center',
  },
  welcome: {
    fontSize: 16,
    letterSpacing: 4.2,
    color: DOC.gold,
    fontWeight: 600,
    textAlign: 'center',
  },
  names: {
    marginTop: 10,
    alignItems: 'center',
    width: '100%',
  },
  guest: {
    fontSize: 64,
    fontWeight: 600,
    color: DOC.forest,
    textAlign: 'center',
    letterSpacing: 2,
    lineHeight: 1.05,
  },
  guestCompact: {
    fontSize: 46,
  },
  amp: {
    fontSize: 28,
    color: DOC.gold,
    textAlign: 'center',
    marginVertical: 6,
    fontWeight: 400,
  },
})

export function PagingBoardDocument({ data, logoSrc }: { data: DriverPackData; logoSrc: string | null }) {
  const names = data.guestNames.length ? data.guestNames : [data.guestName]
  const compact = names.length > 2
  return (
    <Document title={`LankaLux Paging Board — ${data.guestName}`} author="LankaLux" subject="Airport paging board">
      <Page size="A3" orientation="landscape" style={styles.page}>
        <View style={styles.frame}>
          <View style={styles.inner}>
            <DriverPackLogo src={logoSrc} height={72} maxWidth={360} align="center" />
            <Text style={styles.tagline}>{DOC.tagline.toUpperCase()}</Text>
            <View style={styles.rule} />
            <Text style={styles.welcome}>WELCOME TO SRI LANKA</Text>
            <View style={styles.names}>
              {names.map((name, index) => (
                <View key={`${name}-${index}`} style={{ alignItems: 'center', width: '100%' }}>
                  {index > 0 ? <Text style={styles.amp}>&</Text> : null}
                  <Text style={[styles.guest, compact ? styles.guestCompact : {}]}>{name.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
