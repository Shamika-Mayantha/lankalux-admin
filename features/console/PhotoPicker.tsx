'use client'

export function PhotoPicker({
  value,
  images,
  onChange,
}: {
  value: string
  images: string[]
  onChange: (src: string) => void
}) {
  return (
    <div className="ll-photos">
      <button
        type="button"
        className={`ll-photo-tile ll-photo-none ${!value ? 'is-on' : ''}`}
        onClick={() => onChange('')}
        aria-label="No photograph"
      />
      {images.map((src) => (
        <button
          key={src}
          type="button"
          className={`ll-photo-tile ${value === src ? 'is-on' : ''}`}
          onClick={() => onChange(src)}
          aria-pressed={value === src}
        >
          <img src={src} alt="" />
        </button>
      ))}
    </div>
  )
}
