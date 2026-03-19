'use client'

import { Map, RefreshCw, ImageIcon } from 'lucide-react'
import type { ItineraryOption } from './itinerary-types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

export function ItineraryCard({
  index,
  option,
  isSelected,
  isRegenerating,
  isCancelled,
  selectingOption,
  onSelect,
  onRegenerate,
  onPreview,
}: {
  index: number
  option: ItineraryOption
  isSelected: boolean
  isRegenerating: boolean
  isCancelled: boolean
  selectingOption: number | null
  onSelect: () => void
  onRegenerate: () => void
  onPreview: () => void
}) {
  const daysText = Array.isArray(option.days)
    ? option.days
        .map(
          (day: { day: number; title: string; location: string; activities?: string[] }) =>
            `Day ${day.day}: ${day.title} - ${day.location}\n${day.activities?.map((act: string) => `  • ${act}`).join('\n') || ''}`
        )
        .join('\n\n')
    : typeof option.days === 'string'
      ? option.days
      : ''

  return (
    <div
      className={`itinerary-card rounded-2xl border-2 p-6 flex flex-col transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 ${
        isSelected ? 'border-[var(--accent-gold)] ring-2 ring-[var(--accent-gold)]/40' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Map className="w-5 h-5 itinerary-card-title shrink-0" />
          <h3 className="itinerary-card-title text-xl font-semibold truncate">{option.title}</h3>
        </div>
        {isSelected && <Badge>Selected</Badge>}
      </div>
      <p className="itinerary-card-muted text-sm mb-4 line-clamp-2">{option.summary}</p>
      <div className="itinerary-card-inner rounded-xl border p-4 max-h-64 overflow-y-auto mb-4 flex-1">
        <p className="text-sm whitespace-pre-wrap font-mono leading-relaxed" style={{ color: 'var(--text-itinerary-body)' }}>{daysText}</p>
      </div>
      {typeof option.total_kilometers === 'number' && (
        <div className="itinerary-card-inner mb-4 rounded-xl border p-3">
          <p className="itinerary-card-muted text-xs uppercase tracking-wide mb-1">Total km</p>
          <p className="itinerary-card-title text-lg font-semibold">{option.total_kilometers.toLocaleString()} km</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button
          variant="secondary"
          onClick={onPreview}
          disabled={isCancelled}
          className="inline-flex items-center gap-2"
        >
          <ImageIcon className="w-4 h-4" />
          Preview
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          variant={isSelected ? 'secondary' : 'primary'}
          onClick={onSelect}
          disabled={selectingOption !== null}
        >
          {selectingOption === index ? (
            <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
          ) : null}
          {isSelected ? 'Deselect' : 'Select option'}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onRegenerate}
          disabled={isRegenerating || isCancelled}
          title="Regenerate"
        >
          <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  )
}

export function ItineraryPlaceholder({
  index,
  isCancelled,
  generating,
  onGenerate,
}: {
  index: number
  isCancelled: boolean
  generating: boolean
  onGenerate: () => void
}) {
  return (
    <div className="itinerary-card rounded-2xl border-2 border-dashed p-10 flex flex-col items-center justify-center min-h-[280px] text-center">
      <Map className="w-12 h-12 itinerary-card-muted mb-4" />
      <p className="itinerary-card-muted mb-4">Option {index + 1} not generated yet</p>
      <Button onClick={onGenerate} disabled={generating || isCancelled}>
        {generating ? (
          <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-black border-t-transparent" />
        ) : null}
        Generate option {index + 1}
      </Button>
    </div>
  )
}

export function ItineraryGenerating({ index }: { index: number }) {
  return (
    <div className="itinerary-card rounded-2xl border p-10 flex flex-col items-center justify-center min-h-[280px]">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-[var(--accent-gold)] border-t-transparent mb-4" />
      <p className="itinerary-card-muted">Generating option {index + 1}…</p>
    </div>
  )
}
