import { Image, View } from '@react-pdf/renderer'

export function DriverPackLogo({
  src,
  height = 40,
  align = 'left',
  maxWidth = 220,
}: {
  src: string | null | undefined
  height?: number
  align?: 'left' | 'center'
  maxWidth?: number
}) {
  if (!src) return <View style={{ height }} />
  return (
    <View style={{ alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      <Image
        src={src}
        cache={false}
        style={{
          height,
          width: maxWidth,
          objectFit: 'contain',
        }}
      />
    </View>
  )
}
