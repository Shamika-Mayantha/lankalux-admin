'use client'

import { Map, RefreshCw } from 'lucide-react'
import type { ItineraryOption } from './itinerary-types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ImageManager } from '@/components/ImageManager'
import { normalizeManagedImages } from '@/lib/managed-image'
import type { ManagedImageItem } from '@/lib/managed-image'

export function ItineraryCard({
  index,
  option,
  isSelected,
  isRegenerating,
  isCancelled,
  selectingOption,
  onSelect,
  onRegenerate,
  requestId,
  onImagesChange,
  savingImages,
}: {
  index: number
  option: ItineraryOption
  isSelected: boolean
  isRegenerating: boolean
  isCancelled: boolean
  selectingOption: number | null
  onSelect: () => void
  onRegenerate: () => void
  requestId: string
  onImagesChange: (items: ManagedImageItem[]) => void
  savingImages?: boolean
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
      className={`rounded-2xl border-2 p-6 flex flex-col transition-all duration-300 bg-gradient-to-b from-zinc-900/90 to-[#121110] shadow-lg hover:shadow-xl hover:shadow-[#d4af37]/5 hover:-translate-y-1 ${
        isSelected ? 'border-[#d4af37] ring-2 ring-[#d4af37]/40' : 'border-zinc-700'
      }`}
    >
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Map className="w-5 h-5 text-[#d4af37] shrink-0" />
          <h3 className="text-xl font-semibold text-[#d4af37] truncate">{option.title}</h3>
        </div>
        {isSelected && <Badge>Selected</Badge>}
      </div>
      <p className="text-sm text-zinc-400 mb-4 line-clamp-2">{option.summary}</p>
      <div className="rounded-xl border border-zinc-700 bg-zinc-950/50 p-4 max-h-64 overflow-y-auto mb-4 flex-1">
        <p className="text-zinc-300 text-sm whitespace-pre-wrap font-mono leading-relaxed">{daysText}</p>
      </div>
      {typeof option.total_kilometers === 'number' && (
        <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900/50 p-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total km</p>
          <p className="text-[#d4af37] text-lg font-semibold">{option.total_kilometers.toLocaleString()} km</p>
        </div>
      )}
      <div className="mb-4 rounded-xl border border-zinc-700/80 bg-zinc-950/60 p-4">
        <ImageManager
          items={normalizeManagedImages(option.images)}
          onChange={onImagesChange}
          requestId={requestId}
          sectionLabel="Images"
          disabled={!!savingImages || isCancelled}
        />
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
    <div className="rounded-2xl border-2 border-dashed border-zinc-700 bg-zinc-900/30 p-10 flex flex-col items-center justify-center min-h-[280px] text-center">
      <Map className="w-12 h-12 text-zinc-600 mb-4" />
      <p className="text-zinc-500 mb-4">Option {index + 1} not generated yet</p>
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
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900/40 p-10 flex flex-col items-center justify-center min-h-[280px]">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#d4af37] border-t-transparent mb-4" />
      <p className="text-zinc-400">Generating option {index + 1}…</p>
    </div>
  )
}
