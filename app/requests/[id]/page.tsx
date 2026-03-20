'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FOLLOW_UP_TEMPLATES, getTemplate, type TemplateId } from '@/lib/email-templates'
import { FLEET_VEHICLES, getFleetVehicleById, getAllFleetImages } from '@/lib/fleet'
import { Map, Building2, Send, Mail } from 'lucide-react'
import { HotelModal } from '@/components/requests/HotelModal'
import { HotelCard } from '@/components/requests/HotelCard'
import { ItineraryCard, ItineraryPlaceholder, ItineraryGenerating } from '@/components/requests/ItineraryCard'
import type { HotelRecord } from '@/lib/hotel-types'
import { parseHotelOptions } from '@/lib/hotel-types'
import { formatItineraryDaysPlain, buildHotelSectionPlain } from '@/lib/email-itinerary-hotel'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ClientViewPreviewModal } from '@/components/ClientViewPreviewModal'
import { ImageManager } from '@/components/ImageManager'
import type { ManagedImageItem } from '@/lib/managed-image'
import { imageSrcs, normalizeManagedImages, absoluteImageSrc } from '@/lib/managed-image'

const PUBLIC_SITE_BASE = 'https://admin.lankalux.com'

interface ItineraryOption {
  title: string
  days: string | { day: number; title: string; location: string; activities?: string[] }[]
  summary: string
  total_kilometers?: number
  images?: ManagedImageItem[]
}

interface ItineraryOptions {
  options: (ItineraryOption | null)[]
}

interface Request {
  id: string
  client_name: string | null
  email: string | null
  whatsapp: string | null
  start_date: string | null
  end_date: string | null
  duration: number | null
  origin_country: string | null
  number_of_adults: number | null
  number_of_children: number | null
  children_ages: string | null
  additional_preferences: string | null
  itineraryoptions: string | null
  itinerary_options?: ItineraryOptions | null
  selected_option: number | null
  public_token: string | null
  status: string | null
  cancellation_reason?: string | null
  notes: string | null
  sent_at: string | null
  last_sent_at: string | null
  last_sent_option: number | null
  email_sent_count: number | null
  sent_options: any[] | null
  hotel_options?: string | null
  follow_up_emails_sent?: { sent_at: string; template_id: string; template_name: string; subject: string }[] | null
  link_opens?: { opened_at: string; option_index?: number | null }[] | null
  created_at: string
  updated_at: string | null
}

const MS_PER_DAY = 1000 * 60 * 60 * 24
function inclusiveDaysFromMs(ms: number) {
  return Math.floor(ms / MS_PER_DAY) + 1
}

export default function RequestDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const [request, setRequest] = useState<Request | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [generatingItinerary, setGeneratingItinerary] = useState(false)
  const [generatingOption, setGeneratingOption] = useState<number | null>(null) // Track which option is being generated (0, 1, or 2)
  const [selectingOption, setSelectingOption] = useState<number | null>(null)
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [editingClientInfo, setEditingClientInfo] = useState(false)
  const [statusValue, setStatusValue] = useState('')
  const [notesValue, setNotesValue] = useState('')
  const [clientNameValue, setClientNameValue] = useState('')
  const [emailValue, setEmailValue] = useState('')
  const [whatsappValue, setWhatsappValue] = useState('')
  const [startDateValue, setStartDateValue] = useState('')
  const [endDateValue, setEndDateValue] = useState('')
  const [numberOfAdultsValue, setNumberOfAdultsValue] = useState('')
  const [numberOfChildrenValue, setNumberOfChildrenValue] = useState('')
  const [childrenAgesValue, setChildrenAgesValue] = useState<string[]>([])
  const [additionalPreferencesValue, setAdditionalPreferencesValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [sendingItinerary, setSendingItinerary] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(false)
  const [editingSentItinerary, setEditingSentItinerary] = useState(false)
  const [sentItineraryTitle, setSentItineraryTitle] = useState('')
  const [sentItinerarySummary, setSentItinerarySummary] = useState('')
  const [sentItineraryDays, setSentItineraryDays] = useState('')
  const [savingSentItinerary, setSavingSentItinerary] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<TemplateId>('friendly_checkin')
  const [sendingTemplateEmail, setSendingTemplateEmail] = useState(false)
  const [templateEmailSuccess, setTemplateEmailSuccess] = useState(false)
  const [templateEmailModalOpen, setTemplateEmailModalOpen] = useState(false)
  const [previewSubject, setPreviewSubject] = useState('')
  const [previewBody, setPreviewBody] = useState('')
  const [sentItineraryExpanded, setSentItineraryExpanded] = useState(false)
  const [followUpEmailsSentExpanded, setFollowUpEmailsSentExpanded] = useState(false)
  const [linkOpensExpanded, setLinkOpensExpanded] = useState(false)
  const [savingManualOption, setSavingManualOption] = useState<number | null>(null)
  const [manualDrafts, setManualDrafts] = useState<Record<number, { title: string; summary: string; days: string }>>({})
  const [cancellationReasonModalOpen, setCancellationReasonModalOpen] = useState(false)
  const [cancellationReasonInput, setCancellationReasonInput] = useState('')
  const [cancellationReasonPending, setCancellationReasonPending] = useState<'status' | 'trip' | null>(null)
  const [includeVehicleInItinerary, setIncludeVehicleInItinerary] = useState(false)
  const [sendVehiclePhotos, setSendVehiclePhotos] = useState<string[]>([])
  const [includePriceInItinerary, setIncludePriceInItinerary] = useState(false)
  const [sendPriceValue, setSendPriceValue] = useState('')
  const [sendVehicleId, setSendVehicleId] = useState('')
  const [hotels, setHotels] = useState<HotelRecord[]>([])
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null)
  const [hotelModalOpen, setHotelModalOpen] = useState(false)
  const [editingHotel, setEditingHotel] = useState<HotelRecord | null>(null)
  const [includeItinerarySend, setIncludeItinerarySend] = useState(true)
  const [includeHotelSend, setIncludeHotelSend] = useState(true)
  const [savingHotels, setSavingHotels] = useState(false)
  const [clientPreviewOpen, setClientPreviewOpen] = useState(false)
  const [previewingOptionIndex, setPreviewingOptionIndex] = useState<number | null>(null)
  const [defaultImagesByOption, setDefaultImagesByOption] = useState<Record<number, ManagedImageItem[]>>({})
  const [savingItineraryImages, setSavingItineraryImages] = useState<number | null>(null)

  useEffect(() => {
    if (!request) return
    const { hotels: h, selectedHotelId: sid } = parseHotelOptions(request.hotel_options ?? null)
    setHotels(h)
    setSelectedHotelId(sid)
  }, [request?.id, request?.hotel_options])

  useEffect(() => {
    const fetchRequest = async () => {
      try {
        setLoading(true)
        const id = params.id as string

        if (!id) {
          setNotFound(true)
          setLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('Client Requests')
          .select('*')
          .eq('id', id)
          .single()

        if (error) {
          console.error('Error fetching request:', error)
          setNotFound(true)
          setLoading(false)
          return
        }

        if (!data) {
          setNotFound(true)
          setLoading(false)
          return
        }

        const requestData = data as any
        
        // Parse itineraryoptions string to object if it exists
        if (requestData.itineraryoptions && typeof requestData.itineraryoptions === 'string') {
          try {
            requestData.itinerary_options = JSON.parse(requestData.itineraryoptions)
          } catch (parseError) {
            console.error('Error parsing itineraryoptions:', parseError)
            requestData.itinerary_options = null
          }
        } else {
          requestData.itinerary_options = null
        }

        // Parse sent_options string to array if it exists
        if (requestData.sent_options && typeof requestData.sent_options === 'string') {
          try {
            requestData.sent_options = JSON.parse(requestData.sent_options)
          } catch (parseError) {
            console.error('Error parsing sent_options:', parseError)
            requestData.sent_options = []
          }
        } else if (!requestData.sent_options) {
          requestData.sent_options = []
        }

        if (requestData.follow_up_emails_sent != null && typeof requestData.follow_up_emails_sent === 'string') {
          try {
            const parsed = JSON.parse(requestData.follow_up_emails_sent)
            requestData.follow_up_emails_sent = Array.isArray(parsed) ? parsed : []
          } catch {
            requestData.follow_up_emails_sent = []
          }
        } else if (!Array.isArray(requestData.follow_up_emails_sent)) {
          requestData.follow_up_emails_sent = []
        }
        if (requestData.link_opens != null && typeof requestData.link_opens === 'string') {
          try {
            const parsed = JSON.parse(requestData.link_opens)
            requestData.link_opens = Array.isArray(parsed) ? parsed : []
          } catch {
            requestData.link_opens = []
          }
        } else if (!Array.isArray(requestData.link_opens)) {
          requestData.link_opens = []
        }
        
        setRequest(requestData)
        setStatusValue(requestData.status || '')
        setNotesValue(requestData.notes || '')
        setClientNameValue(requestData.client_name || '')
        setEmailValue(requestData.email || '')
        setWhatsappValue(requestData.whatsapp || '')
        setStartDateValue(requestData.start_date || '')
        setEndDateValue(requestData.end_date || '')
        setNumberOfAdultsValue(requestData.number_of_adults?.toString() || '')
        setNumberOfChildrenValue(requestData.number_of_children?.toString() || '')
        if (requestData.children_ages) {
          try {
            const ages = JSON.parse(requestData.children_ages)
            setChildrenAgesValue(Array.isArray(ages) ? ages.map(a => a.toString()) : [])
          } catch {
            setChildrenAgesValue([])
          }
        } else {
          setChildrenAgesValue([])
        }
        setAdditionalPreferencesValue(requestData.additional_preferences || '')
        
        // Initialize sent itinerary editing state if option is selected
        if (requestData.selected_option !== null && requestData.selected_option !== undefined && requestData.itinerary_options?.options) {
          const selectedOption = requestData.itinerary_options.options[requestData.selected_option]
          if (selectedOption) {
            setSentItineraryTitle(selectedOption.title || '')
            setSentItinerarySummary(selectedOption.summary || '')
            setSentItineraryDays(selectedOption.days || '')
          }
        }
        
        setLoading(false)
      } catch (err) {
        console.error('Unexpected error fetching request:', err)
        setNotFound(true)
        setLoading(false)
      }
    }

    fetchRequest()
  }, [params.id])

  // Update sent itinerary state when request changes
  useEffect(() => {
    if (request && request.sent_at && request.itinerary_options?.options) {
      // Use last_sent_option to show what was actually sent, fallback to selected_option, then first option
      const optionIndex = request.last_sent_option !== null && request.last_sent_option !== undefined
        ? request.last_sent_option
        : (request.selected_option !== null && request.selected_option !== undefined 
          ? request.selected_option 
          : 0)
      const selectedOption = request.itinerary_options.options[optionIndex]
      if (selectedOption && !editingSentItinerary) {
        setSentItineraryTitle(selectedOption.title || '')
        setSentItinerarySummary(selectedOption.summary || '')
        // Handle both old format (string) and new format (array of Day objects)
        if (Array.isArray(selectedOption.days)) {
          // New format: convert days array to readable format
          const daysText = selectedOption.days.map(day => 
            `Day ${day.day}: ${day.title} - ${day.location}\n${(day.activities || []).map((act: string) => `  • ${act}`).join('\n')}`
          ).join('\n\n')
          setSentItineraryDays(daysText)
        } else {
          setSentItineraryDays(selectedOption.days || '')
        }
      }
    }
  }, [request, editingSentItinerary])

  // Sync default images from loaded request so "Reset to Default" has a baseline
  useEffect(() => {
    if (!request?.itinerary_options?.options) return
    setDefaultImagesByOption((prev) => {
      let next = prev
      request.itinerary_options!.options!.forEach((opt, i) => {
        if (opt?.images?.length && (next[i] === undefined || next[i]?.length === 0)) {
          next = { ...next, [i]: opt.images }
        }
      })
      return next
    })
  }, [request?.id])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }) + ' at ' + date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    } catch {
      return dateString
    }
  }

  const getStatusColor = (status: string | null) => {
    if (!status) return 'text-secondary'
    const statusLower = status.toLowerCase()
    if (statusLower === 'new') return 'text-blue-300'
    if (statusLower === 'follow_up') return 'text-amber-300'
    if (statusLower === 'deposit') return 'text-cyan-300'
    if (statusLower === 'sold') return 'text-emerald-300'
    if (statusLower === 'after_sales') return 'text-violet-300'
    if (statusLower === 'cancelled') return 'text-rose-300'
    return 'text-secondary'
  }

  const getStatusBgColor = (status: string | null) => {
    if (!status) return 'bg-zinc-800/80'
    const statusLower = status.toLowerCase()
    if (statusLower === 'new') return 'bg-blue-950/50'
    if (statusLower === 'follow_up') return 'bg-amber-950/40'
    if (statusLower === 'deposit') return 'bg-cyan-950/40'
    if (statusLower === 'sold') return 'bg-emerald-950/40'
    if (statusLower === 'after_sales') return 'bg-violet-950/40'
    if (statusLower === 'cancelled') return 'bg-rose-950/45'
    return 'bg-zinc-800/80'
  }

  const fetchRequestData = async (id: string) => {
    const { data, error } = await supabase
      .from('Client Requests')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching request:', error)
      return null
    }

    const requestData = data as any
    
    // Parse itineraryoptions string to object if it exists
    if (requestData?.itineraryoptions && typeof requestData.itineraryoptions === 'string') {
      try {
        requestData.itinerary_options = JSON.parse(requestData.itineraryoptions)
      } catch (parseError) {
        console.error('Error parsing itineraryoptions:', parseError)
        requestData.itinerary_options = null
      }
    } else {
      requestData.itinerary_options = null
    }

    // Parse sent_options string to array if it exists
    if (requestData?.sent_options && typeof requestData.sent_options === 'string') {
      try {
        requestData.sent_options = JSON.parse(requestData.sent_options)
      } catch (parseError) {
        console.error('Error parsing sent_options:', parseError)
        requestData.sent_options = []
      }
    } else if (!requestData?.sent_options) {
      requestData.sent_options = []
    }

    if (requestData?.follow_up_emails_sent != null && typeof requestData.follow_up_emails_sent === 'string') {
      try {
        const parsed = JSON.parse(requestData.follow_up_emails_sent)
        requestData.follow_up_emails_sent = Array.isArray(parsed) ? parsed : []
      } catch {
        requestData.follow_up_emails_sent = []
      }
    } else if (!Array.isArray(requestData?.follow_up_emails_sent)) {
      requestData.follow_up_emails_sent = []
    }
    if (requestData?.link_opens != null && typeof requestData.link_opens === 'string') {
      try {
        const parsed = JSON.parse(requestData.link_opens)
        requestData.link_opens = Array.isArray(parsed) ? parsed : []
      } catch {
        requestData.link_opens = []
      }
    } else if (!Array.isArray(requestData?.link_opens)) {
      requestData.link_opens = []
    }

    // Auto-update status to follow_up if email_sent_count > 0 (do not overwrite explicit 'cancelled')
    const statusLower = (requestData.status || '').toLowerCase()
    if (requestData.email_sent_count && requestData.email_sent_count > 0 && requestData.status !== 'follow_up' && statusLower !== 'cancelled') {
      // Update status in database
      await (supabase.from('Client Requests') as any)
        .update({ status: 'follow_up', updated_at: new Date().toISOString() })
        .eq('id', id)
      
      // Update local data
      requestData.status = 'follow_up'
    }

    // Update local state values
    if (requestData) {
      setClientNameValue(requestData.client_name || '')
      setEmailValue(requestData.email || '')
      setWhatsappValue(requestData.whatsapp || '')
      setStartDateValue(requestData.start_date || '')
      setEndDateValue(requestData.end_date || '')
      setNumberOfAdultsValue(requestData.number_of_adults?.toString() || '')
      setNumberOfChildrenValue(requestData.number_of_children?.toString() || '')
      if (requestData.children_ages) {
        try {
          const ages = JSON.parse(requestData.children_ages)
          setChildrenAgesValue(Array.isArray(ages) ? ages.map(a => a.toString()) : [])
        } catch {
          setChildrenAgesValue([])
        }
      } else {
        setChildrenAgesValue([])
      }
      setAdditionalPreferencesValue(requestData.additional_preferences || '')
      setStatusValue(requestData.status || '')
      setNotesValue(requestData.notes || '')
    }

    return requestData
  }

  const handleSaveClientInfo = async () => {
    if (!request) return

    try {
      setSaving(true)

      // Calculate duration if dates changed
      let duration = request.duration
      if (startDateValue && endDateValue) {
        const start = new Date(startDateValue)
        const end = new Date(endDateValue)
        if (end >= start) {
          const diffTime = Math.abs(end.getTime() - start.getTime())
          duration = inclusiveDaysFromMs(diffTime)
        }
      }

      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          client_name: clientNameValue.trim() || null,
          email: emailValue.trim() || null,
          whatsapp: whatsappValue.trim() || null,
          start_date: startDateValue || null,
          end_date: endDateValue || null,
          duration: duration || null,
          number_of_adults: numberOfAdultsValue ? parseInt(numberOfAdultsValue) : null,
          number_of_children: numberOfChildrenValue ? parseInt(numberOfChildrenValue) : null,
          children_ages: childrenAgesValue.length > 0 ? JSON.stringify(childrenAgesValue.map(age => parseInt(age)).filter(age => !isNaN(age))) : null,
          additional_preferences: additionalPreferencesValue.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error updating client info:', error)
        alert('Failed to save changes. Please try again.')
        setSaving(false)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
      }
      setEditingClientInfo(false)
      setSaving(false)
    } catch (err) {
      console.error('Unexpected error saving client info:', err)
      alert('An unexpected error occurred. Please try again.')
      setSaving(false)
    }
  }

  const handleGenerateSingleOption = async (optionIndex: number) => {
    if (!request) return

    try {
      setGeneratingOption(optionIndex)

      const response = await fetch("/api/generate-single-option", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: request.id, optionIndex }),
      })

      // Check if response is ok before trying to parse JSON
      let result
      try {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          result = await response.json()
        } else {
          const text = await response.text()
          throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}`)
        }
      } catch (parseError) {
        console.error('Error parsing response:', parseError)
        if (!response.ok) {
          const errorMessage = response.status === 504 
            ? 'Request timed out. Please try again.'
            : `Server error (${response.status}). Please try again.`
          alert(`Failed to generate option ${optionIndex + 1}: ${errorMessage}`)
          setGeneratingOption(null)
          return
        }
        throw parseError
      }

      if (!response.ok || !result.success) {
        const errorMessage = result.error || 'Failed to generate option'
        alert(`Failed to generate option ${optionIndex + 1}: ${errorMessage}`)
        setGeneratingOption(null)
        return
      }

      // Refresh request data to show the new option
      let updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
      }
      const newOpt = updatedRequest?.itinerary_options?.options?.[optionIndex] as ItineraryOption | null | undefined
      const hasNoImages = !newOpt?.images || newOpt.images.length === 0
      if (updatedRequest && hasNoImages) {
        try {
          const libRes = await fetch('/api/image-library')
          const libData = await libRes.json()
          const paths: string[] = Array.isArray(libData.paths) ? libData.paths : []
          const defaultItems: ManagedImageItem[] = paths.map((p: string) => ({ src: p, type: 'default' }))
          if (defaultItems.length > 0) {
            await handleUpdateItineraryImages(optionIndex, defaultItems)
            updatedRequest = await fetchRequestData(request.id) ?? updatedRequest
            setRequest(updatedRequest)
            setDefaultImagesByOption((prev) => ({ ...prev, [optionIndex]: defaultItems }))
          }
        } catch (e) {
          console.error('Failed to load default images:', e)
        }
      }
      setGeneratingOption(null)
    } catch (err) {
      console.error('Unexpected error generating option:', err)
      alert(`An unexpected error occurred while generating option ${optionIndex + 1}. Please try again.`)
      setGeneratingOption(null)
    }
  }

  const handleGenerateItinerary = async () => {
    if (!request) return

    try {
      setGeneratingItinerary(true)

      const response = await fetch("/api/generate-itinerary", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: request.id }),
      })

      // Check if response is ok before trying to parse JSON
      let result
      try {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          result = await response.json()
        } else {
          // If not JSON, it might be a timeout or other error
          const text = await response.text()
          throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}`)
        }
      } catch (parseError) {
        console.error('Error parsing response:', parseError)
        if (!response.ok) {
          // If response is not ok and we can't parse JSON, it's likely a timeout
          const errorMessage = response.status === 504 
            ? 'Request timed out. The itinerary generation is taking longer than expected. Please try again or contact support if the issue persists.'
            : `Server error (${response.status}). Please try again.`
          alert(`Failed to generate itinerary: ${errorMessage}`)
          setGeneratingItinerary(false)
          return
        }
        throw parseError
      }

      if (!response.ok || !result.success) {
        const errorMessage = result.error || 'Failed to generate itinerary'
        console.error('Error generating itinerary:', errorMessage)
        console.error('Error details:', result.details)
        
        // Check if we have partial results
        if (result.partial && result.optionsGenerated > 0) {
          const partialMessage = `Partially generated: ${result.optionsGenerated} of 3 options were created. ${errorMessage}\n\nYou can view the generated options below, or try regenerating to get all 3 options.`
          alert(partialMessage)
          // Still refresh to show partial results
          const updatedRequest = await fetchRequestData(request.id)
          if (updatedRequest) {
            setRequest(updatedRequest)
          }
          setGeneratingItinerary(false)
          return
        }
        
        // Show detailed error in console and alert
        let alertMessage = `Failed to generate itinerary: ${errorMessage}`
        if (result.details) {
          console.error('Full error details:', JSON.stringify(result.details, null, 2))
          if (result.details.parseError) {
            alertMessage += `\n\nParse Error: ${result.details.parseError}`
          }
          if (result.details.contentLength) {
            alertMessage += `\nContent Length: ${result.details.contentLength} chars`
          }
          if (result.details.syntaxErrorPosition) {
            alertMessage += `\nError at position: ${result.details.syntaxErrorPosition}`
          }
          if (result.details.openBraces !== result.details.closeBraces) {
            alertMessage += `\nMismatched braces: ${result.details.openBraces} open, ${result.details.closeBraces} close`
          }
        }
        
        alert(alertMessage)
        setGeneratingItinerary(false)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)

      if (!updatedRequest) {
        alert('Itinerary generated but failed to fetch updated data. Please refresh the page.')
        setGeneratingItinerary(false)
        return
      }

      setRequest(updatedRequest)
      setGeneratingItinerary(false)
    } catch (err) {
      console.error('Unexpected error generating itinerary:', err)
      alert('An unexpected error occurred. Please try again.')
      setGeneratingItinerary(false)
    }
  }

  const handleSelectOption = async (optionIndex: number) => {
    if (!request) return

    try {
      setSelectingOption(optionIndex)

      // If clicking the same option that's already selected, deselect it
      if (request.selected_option === optionIndex) {
        const { error } = await (supabase.from('Client Requests') as any)
          .update({
            selected_option: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', request.id)

        if (error) {
          console.error('Error deselecting option:', error)
          alert('Failed to deselect option. Please try again.')
          setSelectingOption(null)
          return
        }

        const updatedRequest = await fetchRequestData(request.id)
        if (updatedRequest) {
          setRequest(updatedRequest)
        }
        setSelectingOption(null)
        return
      }

      // Generate public token if it doesn't exist
      let publicToken = request.public_token
      if (!publicToken) {
        publicToken = crypto.randomUUID()
      }

      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          selected_option: optionIndex,
          public_token: publicToken,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error selecting option:', error)
        alert('Failed to select option. Please try again.')
        setSelectingOption(null)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
      }
      setSelectingOption(null)
    } catch (err) {
      console.error('Unexpected error selecting option:', err)
      alert('An unexpected error occurred. Please try again.')
      setSelectingOption(null)
    }
  }

  const handleUpdateItineraryImages = async (optionIndex: number, items: ManagedImageItem[]) => {
    if (!request || request.status?.toLowerCase() === 'cancelled') return
    setSavingItineraryImages(optionIndex)
    try {
      const raw = [...(request.itinerary_options?.options ?? [])]
      while (raw.length <= optionIndex) raw.push(null)
      const opt = raw[optionIndex] as ItineraryOption | null
      if (!opt) {
        setSavingItineraryImages(null)
        return
      }
      const nextOpt: ItineraryOption = { ...opt, images: items }
      if (Array.isArray(nextOpt.days)) {
        nextOpt.days = nextOpt.days.map((d, i) => ({
          ...d,
          image: items[i + 1]?.src || undefined,
        }))
      }
      raw[optionIndex] = nextOpt
      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          itineraryoptions: JSON.stringify({ options: raw }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)
      if (error) throw error
      const updated = await fetchRequestData(request.id)
      if (updated) setRequest(updated)
    } catch (e) {
      console.error(e)
      alert('Could not save itinerary images.')
    } finally {
      setSavingItineraryImages(null)
    }
  }

  const handleUpdateManualItineraryImages = async (optionIndex: number, items: ManagedImageItem[]) => {
    if (!request || request.status?.toLowerCase() === 'cancelled' || optionIndex < 3) return
    setSavingManualOption(optionIndex)
    try {
      const raw = getOptionsArray()
      const opt = raw[optionIndex] as ItineraryOption | null
      if (!opt) return
      raw[optionIndex] = { ...opt, images: items }
      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          itineraryoptions: JSON.stringify({ options: raw }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)
      if (error) throw error
      const updated = await fetchRequestData(request.id)
      if (updated) setRequest(updated)
    } catch (e) {
      console.error(e)
      alert('Could not save images.')
    } finally {
      setSavingManualOption(null)
    }
  }

  const ensurePublicToken = async (): Promise<string> => {
    if (!request) throw new Error('No request')
    if (request.public_token) return request.public_token
    const token = crypto.randomUUID()
    await (supabase.from('Client Requests') as any)
      .update({ public_token: token, updated_at: new Date().toISOString() })
      .eq('id', request.id)
    setRequest((r) => (r ? { ...r, public_token: token } : r))
    return token
  }

  const getOptionsArray = (): (ItineraryOption | null)[] => {
    const opts = request?.itinerary_options?.options ?? []
    const arr: (ItineraryOption | null)[] = [...opts]
    while (arr.length < 3) arr.push(null)
    return arr
  }

  const handleAddManualItinerary = async () => {
    if (!request) return
    try {
      await ensurePublicToken()
      const options = getOptionsArray()
      options.push({ title: 'Manual Itinerary', summary: '', days: '' })
      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          itineraryoptions: JSON.stringify({ options }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)
      if (error) throw error
      const updated = await fetchRequestData(request.id)
      if (updated) setRequest(updated)
    } catch (err) {
      console.error(err)
      alert('Failed to add manual itinerary. Please try again.')
    }
  }

  const handleSaveManualItinerary = async (index: number, draft: { title: string; summary: string; days: string }) => {
    if (!request) return
    setSavingManualOption(index)
    try {
      const options = getOptionsArray()
      if (options[index] === null) options[index] = { title: '', summary: '', days: '' }
      const opt = options[index] as ItineraryOption
      options[index] = { ...opt, title: draft.title.trim() || opt.title, summary: draft.summary.trim() || opt.summary, days: draft.days.trim() || (typeof opt.days === 'string' ? opt.days : '') }
      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          itineraryoptions: JSON.stringify({ options }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)
      if (error) throw error
      const updated = await fetchRequestData(request.id)
      if (updated) setRequest(updated)
      setManualDrafts((d) => { const next = { ...d }; delete next[index]; return next; })
    } catch (err) {
      console.error(err)
      alert('Failed to save. Please try again.')
    } finally {
      setSavingManualOption(null)
    }
  }

  const handleRemoveManualItinerary = async (index: number) => {
    if (!request || index < 3) return
    if (!confirm('Remove this manual itinerary? This cannot be undone.')) return
    try {
      const options = getOptionsArray().filter((_, i) => i !== index)
      while (options.length < 3) options.push(null)
      let newSelected = request.selected_option
      if (request.selected_option === index) newSelected = null
      else if (request.selected_option !== null && request.selected_option > index) newSelected = request.selected_option - 1
      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          itineraryoptions: JSON.stringify({ options }),
          selected_option: newSelected,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)
      if (error) throw error
      const updated = await fetchRequestData(request.id)
      if (updated) setRequest(updated)
      setManualDrafts((d) => { const next = { ...d }; delete next[index]; return next; })
    } catch (err) {
      console.error(err)
      alert('Failed to remove. Please try again.')
    }
  }

  const handleSaveStatus = async () => {
    if (!request) return

    const isCancelled = statusValue?.toLowerCase() === 'cancelled'
    if (isCancelled) {
      setCancellationReasonInput('')
      setCancellationReasonPending('status')
      setCancellationReasonModalOpen(true)
      return
    }

    try {
      setSaving(true)
      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          status: statusValue || null,
          cancellation_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error updating status:', error)
        alert('Failed to save status. Please try again.')
        setSaving(false)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) setRequest(updatedRequest)
      setEditingStatus(false)
      setSaving(false)
    } catch (err) {
      console.error('Unexpected error saving status:', err)
      alert('An unexpected error occurred. Please try again.')
      setSaving(false)
    }
  }

  const handleSubmitCancellationReason = async () => {
    if (!request || !cancellationReasonPending) return
    const reason = cancellationReasonInput.trim() || null

    try {
      if (cancellationReasonPending === 'status') {
        setSaving(true)
        const { error } = await (supabase.from('Client Requests') as any)
          .update({
            status: 'cancelled',
            cancellation_reason: reason,
            updated_at: new Date().toISOString(),
          })
          .eq('id', request.id)
        if (error) throw error
        const updated = await fetchRequestData(request.id)
        if (updated) setRequest(updated)
        setEditingStatus(false)
        setSaving(false)
      } else {
        setCancelling(true)
        const { error } = await (supabase.from('Client Requests') as any)
          .update({
            status: 'cancelled',
            cancellation_reason: reason,
            updated_at: new Date().toISOString(),
          })
          .eq('id', request.id)
        if (error) throw error
        const updated = await fetchRequestData(request.id)
        if (updated) {
          setRequest(updated)
          setStatusValue('cancelled')
        }
        setCancelling(false)
      }
      setCancellationReasonModalOpen(false)
      setCancellationReasonInput('')
      setCancellationReasonPending(null)
    } catch (err) {
      console.error(err)
      alert('Failed to save. Please try again.')
      setSaving(false)
      setCancelling(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!request) return

    try {
      setSaving(true)
      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          notes: notesValue || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error updating notes:', error)
        alert('Failed to save notes. Please try again.')
        setSaving(false)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
      }
      setEditingNotes(false)
      setSaving(false)
    } catch (err) {
      console.error('Unexpected error saving notes:', err)
      alert('An unexpected error occurred. Please try again.')
      setSaving(false)
    }
  }

  const handleSendLink = () => {
    if (!request || !request.public_token || request.selected_option === null || request.selected_option === undefined) {
      alert('Please select an itinerary option first to generate a shareable link.')
      return
    }

    const baseUrl = "https://admin.lankalux.com"
    const itineraryUrl = baseUrl + '/itinerary/' + request.public_token + '/' + request.selected_option

    const subject = encodeURIComponent('Your LankaLux Sri Lanka Itinerary')
    const body = encodeURIComponent(
      `Dear ${request.client_name || 'Valued Client'},

We are delighted to share your personalized Sri Lanka itinerary with you.

View your itinerary here: ${itineraryUrl}

This link provides access to your selected itinerary option. If you have any questions or would like to discuss modifications, please don't hesitate to reach out.

We look forward to creating an unforgettable experience for you in Sri Lanka.

Best regards,
LankaLux Team`
    )

    window.location.href = `mailto:${request.email || ''}?subject=${subject}&body=${body}`
  }

  const handleWhatsAppShare = () => {
    if (!request) return
    if (!includeItinerarySend && !includeHotelSend) {
      alert('Select at least one: Include itinerary or Include hotel.')
      return
    }
    if (includeItinerarySend) {
      if (!request.public_token || request.selected_option === null || request.selected_option === undefined) {
        alert('Select an itinerary option first (or uncheck Include itinerary).')
        return
      }
    }
    if (includeHotelSend && !selectedHotel) {
      alert('Select a hotel (or uncheck Include hotel).')
      return
    }

    const baseUrl = 'https://admin.lankalux.com'
    const itineraryUrl =
      includeItinerarySend && request.public_token != null && request.selected_option != null
        ? `${baseUrl}/itinerary/${request.public_token}/${request.selected_option}`
        : ''
    const opt =
      includeItinerarySend && request.itinerary_options?.options?.[request.selected_option!]
        ? request.itinerary_options.options[request.selected_option!]
        : null

    const parts: string[] = ['*LankaLux*']
    if (includeItinerarySend && opt) {
      parts.push(
        '',
        '--- ITINERARY ---',
        formatItineraryDaysPlain(opt as ItineraryOption),
        '',
        itineraryUrl
      )
      const itinUrls = imageSrcs(normalizeManagedImages((opt as ItineraryOption).images)).map((s) =>
        absoluteImageSrc(s, baseUrl)
      )
      if (itinUrls.length) {
        parts.push('', 'Itinerary images:', ...itinUrls)
      }
    }
    if (includeHotelSend && selectedHotel) {
      parts.push('', buildHotelSectionPlain(hotelToApiPayload(selectedHotel)))
    }
    const message = encodeURIComponent(parts.join('\n'))

    const whatsappNumber = request.whatsapp?.replace(new RegExp('[^0-9]', 'g'), '') || ''
    if (whatsappNumber) {
      window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank')
    } else {
      alert('WhatsApp number not available for this client.')
    }
  }

  const handleCancelTrip = async () => {
    if (!request) return

    if (!confirm('Are you sure you want to cancel this trip? This will update the status to "cancelled".')) {
      return
    }

    setCancellationReasonInput('')
    setCancellationReasonPending('trip')
    setCancellationReasonModalOpen(true)
  }

  const handleReopenTrip = async () => {
    if (!request) return

    try {
      setReopening(true)
      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          status: 'follow_up',
          cancellation_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error reopening trip:', error)
        alert('Failed to reopen trip. Please try again.')
        setReopening(false)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
        setStatusValue('follow_up')
      }
      setReopening(false)
    } catch (err) {
      console.error('Unexpected error reopening trip:', err)
      alert('An unexpected error occurred. Please try again.')
      setReopening(false)
    }
  }

  const persistHotelOptions = async (nextHotels: HotelRecord[], nextSelectedId: string | null) => {
    if (!request) return false
    setSavingHotels(true)
    try {
      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          hotel_options: JSON.stringify({ hotels: nextHotels, selectedHotelId: nextSelectedId }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)
      if (error) {
        console.error(error)
        alert(
          'Could not save hotels. Add column hotel_options (text) to Client Requests — see supabase/migrations in the project.'
        )
        setSavingHotels(false)
        return false
      }
      setHotels(nextHotels)
      setSelectedHotelId(nextSelectedId)
      const u = await fetchRequestData(request.id)
      if (u) setRequest(u)
      setSavingHotels(false)
      return true
    } catch (e) {
      console.error(e)
      setSavingHotels(false)
      return false
    }
  }

  const selectedHotel = hotels.find((h) => h.id === selectedHotelId) ?? null

  const hotelToApiPayload = (h: HotelRecord) => ({
    name: h.name,
    location: h.location,
    mapsUrl: h.mapsUrl,
    starRating: h.starRating,
    roomType: h.roomType,
    showPrice: h.showPrice,
    pricePerNight: h.pricePerNight,
    description: h.description,
    images: imageSrcs(normalizeManagedImages(h.images)).map((s) => absoluteImageSrc(s, PUBLIC_SITE_BASE)),
  })

  const handleSendItinerary = async () => {
    if (!request) return

    if (!includeItinerarySend && !includeHotelSend) {
      alert('Select at least one: Include itinerary or Include hotel.')
      return
    }
    if (includeItinerarySend) {
      if (request.selected_option === null || request.selected_option === undefined) {
        alert('Please select an itinerary option first (or uncheck Include itinerary).')
        return
      }
    }
    if (includeHotelSend) {
      if (!selectedHotel) {
        alert('Please select a hotel (or uncheck Include hotel).')
        return
      }
    }
    if (!request.email?.trim()) {
      alert('Client email is required to send.')
      return
    }

    try {
      setSendingItinerary(true)
      setSendSuccess(false)

      const baseVehicle = includeVehicleInItinerary && sendVehicleId ? getFleetVehicleById(sendVehicleId) : null
      const vehicleOption = baseVehicle
        ? {
            ...baseVehicle,
            images:
              sendVehiclePhotos.length >= 3 && sendVehiclePhotos.length <= 4
                ? sendVehiclePhotos
                : baseVehicle.images,
          }
        : null
      const sendOptions = {
        include_vehicle: includeItinerarySend && includeVehicleInItinerary,
        include_price: includeItinerarySend && includePriceInItinerary,
        price: includeItinerarySend && includePriceInItinerary ? sendPriceValue.trim() || null : null,
        vehicle_option: includeItinerarySend && vehicleOption ? vehicleOption : null,
      }
      const response = await fetch("/api/send-itinerary", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: request.id,
          send_options: sendOptions,
          include_itinerary: includeItinerarySend,
          include_hotel: includeHotelSend,
          hotel: includeHotelSend && selectedHotel ? hotelToApiPayload(selectedHotel) : undefined,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        const errorMessage = result.error || 'Failed to send itinerary'
        console.error('Error sending itinerary:', errorMessage)
        alert(`Failed to send itinerary: ${errorMessage}`)
        setSendingItinerary(false)
        return
      }

      // Refresh request data
      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        console.log('Updated request after send:', {
          sent_at: updatedRequest.sent_at,
          selected_option: updatedRequest.selected_option,
          has_itinerary_options: !!updatedRequest.itinerary_options?.options,
          itineraryoptions_string: updatedRequest.itineraryoptions ? 'exists' : 'missing',
        })
        setRequest(updatedRequest)
        
        // Initialize sent itinerary state if needed
        if (updatedRequest.sent_at && updatedRequest.itinerary_options?.options) {
          const optionIndex = updatedRequest.selected_option !== null && updatedRequest.selected_option !== undefined 
            ? updatedRequest.selected_option 
            : 0
          const selectedOption = updatedRequest.itinerary_options.options[optionIndex]
          if (selectedOption) {
            setSentItineraryTitle(selectedOption.title || '')
            setSentItinerarySummary(selectedOption.summary || '')
            setSentItineraryDays(selectedOption.days || '')
          }
        }
      } else {
        console.error('Failed to fetch updated request after sending')
      }

      setSendSuccess(true)
      setSendingItinerary(false)
      setClientPreviewOpen(false)

      setTimeout(() => {
        setSendSuccess(false)
      }, 3000)
    } catch (err) {
      console.error('Unexpected error sending itinerary:', err)
      alert('An unexpected error occurred. Please try again.')
      setSendingItinerary(false)
    }
  }

  const openTemplateEmailModal = () => {
    if (!request?.email) return
    const template = getTemplate(selectedTemplateId)
    if (!template) return
    const clientName = request.client_name || 'Valued Client'
    const itineraryUrl =
      request.public_token != null && request.selected_option != null
        ? "https://admin.lankalux.com/itinerary/" + request.public_token + "/" + request.selected_option
        : null
    setPreviewSubject(template.subject)
    setPreviewBody(template.getText({ clientName, itineraryUrl }))
    setTemplateEmailModalOpen(true)
  }

  const handleSendTemplateEmail = async () => {
    if (!request?.email) return
    try {
      setSendingTemplateEmail(true)
      setTemplateEmailSuccess(false)
      const res = await fetch("/api/send-template-email", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          templateId: selectedTemplateId,
          subject: previewSubject.trim() || undefined,
          body: previewBody.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to send email')
        setSendingTemplateEmail(false)
        return
      }
      setTemplateEmailSuccess(true)
      setTemplateEmailModalOpen(false)
      const updated = await fetchRequestData(request.id)
      if (updated) setRequest(updated)
      setTimeout(() => setTemplateEmailSuccess(false), 3000)
    } catch (err) {
      console.error(err)
      alert('An unexpected error occurred. Please try again.')
    } finally {
      setSendingTemplateEmail(false)
    }
  }

  const handleSaveSentItinerary = async () => {
    if (!request) return
    
    // Use last_sent_option to save edits to the option that was actually sent
    const optionIndex = request.last_sent_option !== null && request.last_sent_option !== undefined
      ? request.last_sent_option
      : (request.selected_option !== null && request.selected_option !== undefined
        ? request.selected_option
        : null)
    
    if (optionIndex === null) {
      alert('No sent itinerary option found.')
      return
    }

    try {
      setSavingSentItinerary(true)

      // Get current itinerary options
      const currentOptions = request.itinerary_options?.options || []
      if (!currentOptions[optionIndex]) {
        alert('Sent itinerary option not found.')
        setSavingSentItinerary(false)
        return
      }

      // Update the last sent option (preserve structure for new format)
      const updatedOptions = [...currentOptions]
      const existingOption = currentOptions[optionIndex]
      
      // Check if it's the new format (has days array) or old format (has days string)
      if (Array.isArray(existingOption.days)) {
        // New format: keep the days array structure, just update title and summary
        updatedOptions[optionIndex] = {
          ...existingOption,
          title: sentItineraryTitle.trim(),
          summary: sentItinerarySummary.trim(),
          // Keep days array as is (editing individual days would require more complex UI)
        }
      } else {
        // Old format: update all fields
        updatedOptions[optionIndex] = {
          title: sentItineraryTitle.trim(),
          summary: sentItinerarySummary.trim(),
          days: sentItineraryDays.trim(),
        }
      }

      // Save back to database
      const updatedItineraryOptions = {
        options: updatedOptions,
      }
      const itineraryOptionsString = JSON.stringify(updatedItineraryOptions)

      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          itineraryoptions: itineraryOptionsString,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error saving edited itinerary:', error)
        alert('Failed to save itinerary changes. Please try again.')
        setSavingSentItinerary(false)
        return
      }

      // Refresh request data
      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
      }

      setEditingSentItinerary(false)
      setSavingSentItinerary(false)
    } catch (err) {
      console.error('Unexpected error saving sent itinerary:', err)
      alert('An unexpected error occurred. Please try again.')
      setSavingSentItinerary(false)
    }
  }

  const handleResendFromSentSection = async () => {
    await handleSendItinerary()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center px-6 transition-colors duration-300">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[color:var(--accent-gold)] mb-6" />
          <p className="text-secondary">Loading request details…</p>
        </div>
      </div>
    )
  }

  if (notFound || !request) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center px-6 transition-colors duration-300">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold text-accent-theme mb-4">Request not found</h1>
          <p className="text-secondary mb-8 leading-relaxed">
            The request you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="btn-primary-theme"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  // Ensure itineraryOptions array has 3 slots (may contain null for ungenerated options)
  const itineraryOptions = (() => {
    const options = request.itinerary_options?.options || []
    // Ensure array has exactly 3 slots, filling with null if needed
    const result: (ItineraryOption | null)[] = [...options]
    while (result.length < 3) {
      result.push(null)
    }
    return result.slice(0, 3) // Ensure exactly 3 slots
  })()
  const isCancelled = request.status?.toLowerCase() === 'cancelled'
  
  // Helper function to parse itineraryoptions safely
  const parseItineraryOptions = (itineraryoptions: string | null): ItineraryOptions | null => {
    if (!itineraryoptions || typeof itineraryoptions !== 'string') {
      return null
    }
    try {
      return JSON.parse(itineraryoptions)
    } catch (error) {
      console.error('Error parsing itineraryoptions:', error)
      return null
    }
  }

  const waHref = request?.whatsapp
    ? "https://wa.me/" + request.whatsapp.replace(new RegExp("[^0-9]", "g"), "")
    : ''

  const card = 'card-theme w-full p-8 hover:-translate-y-0.5'
  const field = 'input-field-theme'
  const lbl = 'label-theme'
  const btnPri = 'btn-primary-theme'
  const btnSec = 'btn-secondary-theme'

  return (
    <div className="min-h-screen bg-page text-primary antialiased transition-colors duration-300">
      <div className="w-full max-w-[1400px] mx-auto px-6 py-6 flex flex-col gap-12 pb-20">
        {/* Header */}
        <div className={`${card} animate-fade-in`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-8">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className={`${btnSec} w-fit shrink-0`}
              >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Dashboard
            </button>
              <ThemeToggle />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <img
              src="/favicon.png"
              alt="LankaLux Logo"
              className="h-16 w-16 object-cover rounded-xl ring-1 border-accent ring-[color:var(--border-accent)]"
            />
            <div className="text-left min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-accent-theme tracking-tight">
                Request details
              </h1>
              <p className="text-secondary text-sm mt-2 font-mono break-all">
                ID: {request.id}
              </p>
            </div>
          </div>
        </div>

        {/* Cancelled Warning Banner */}
        {isCancelled && (
          <div className="rounded-2xl border border-red-900/50 bg-red-950/40 p-6 md:p-8 shadow-lg shadow-black/30">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div className="flex items-start gap-4">
                <svg
                  className="w-7 h-7 text-red-400 shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="text-left">
                  <h3 className="text-xl font-semibold text-red-300">Trip cancelled</h3>
                  <p className="text-sm text-red-200/80 mt-2 leading-relaxed">
                    Itinerary generation is disabled for this trip.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReopenTrip}
                disabled={reopening}
                className={`${btnPri} disabled:opacity-50 shrink-0`}
              >
                {reopening ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-black"></div>
                    Reopening...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Reopen Trip
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Client Information */}
        <div className={card}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-8">
                <h2 className="text-left text-2xl font-semibold text-accent-theme">Client information</h2>
                {!editingClientInfo && (
                  <button
                    type="button"
                    onClick={() => setEditingClientInfo(true)}
                    className={`${btnPri} shrink-0`}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Edit
                  </button>
                )}
              </div>
              {editingClientInfo ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    <div>
                      <label className={lbl}>Client name</label>
                      <input
                        type="text"
                        value={clientNameValue}
                        onChange={(e) => setClientNameValue(e.target.value)}
                        className={field}
                      />
                    </div>
                    <div>
                      <label className={lbl}>Email</label>
                      <input
                        type="email"
                        value={emailValue}
                        onChange={(e) => setEmailValue(e.target.value)}
                        className={field}
                      />
                    </div>
                    <div>
                      <label className={lbl}>WhatsApp</label>
                      <input
                        type="text"
                        value={whatsappValue}
                        onChange={(e) => setWhatsappValue(e.target.value)}
                        className={field}
                      />
                    </div>
                    <div>
                      <label className={lbl}>Origin country</label>
                      <p className="text-secondary py-3">{request.origin_country ?? 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <button
                      type="button"
                      onClick={handleSaveClientInfo}
                      disabled={saving}
                      className={`${btnPri} disabled:opacity-50`}
                    >
                      {saving ? 'Saving...' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setClientNameValue(request.client_name || '')
                        setEmailValue(request.email || '')
                        setWhatsappValue(request.whatsapp || '')
                        setStartDateValue(request.start_date || '')
                        setEndDateValue(request.end_date || '')
                        setNumberOfAdultsValue(request.number_of_adults?.toString() || '')
                        setNumberOfChildrenValue(request.number_of_children?.toString() || '')
                        if (request.children_ages) {
                          try {
                            const ages = JSON.parse(request.children_ages)
                            setChildrenAgesValue(Array.isArray(ages) ? ages.map(a => a.toString()) : [])
                          } catch {
                            setChildrenAgesValue([])
                          }
                        } else {
                          setChildrenAgesValue([])
                        }
                        setAdditionalPreferencesValue(request.additional_preferences || '')
                        setEditingClientInfo(false)
                      }}
                      disabled={saving}
                      className={`${btnSec} disabled:opacity-50`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 text-left">
                  <div>
                    <p className={lbl}>Client name</p>
                    <p className="text-primary text-lg font-medium">
                      {request.client_name ?? 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className={lbl}>Email</p>
                    <p className="text-secondary">
                      {request.email ? (
                        <a
                          href={`mailto:${request.email}`}
                          className="text-accent-theme hover:text-[#d4b35c] transition-colors"
                        >
                          {request.email}
                        </a>
                      ) : (
                        'N/A'
                      )}
                    </p>
                  </div>
                  <div>
                    <p className={lbl}>WhatsApp</p>
                    <p className="text-secondary">
                      {request.whatsapp ? (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-theme hover:text-[#d4b35c] transition-colors"
                        >
                          {request.whatsapp}
                        </a>
                      ) : (
                        'N/A'
                      )}
                    </p>
                  </div>
                  <div>
                    <p className={lbl}>Origin country</p>
                    <p className="text-primary">{request.origin_country ?? 'N/A'}</p>
                  </div>
                </div>
              )}
            </div>

        {/* Status & Created */}
        <div className={card}>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8 text-left">
            <div className="flex-1 min-w-0">
              <p className={lbl}>Status</p>
              {editingStatus ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Select
                    value={statusValue}
                    onChange={setStatusValue}
                    options={[
                      { value: 'new', label: 'NEW' },
                      { value: 'follow_up', label: 'FOLLOW_UP' },
                      { value: 'deposit', label: 'DEPOSIT' },
                      { value: 'sold', label: 'SOLD' },
                      { value: 'after_sales', label: 'AFTER_SALES' },
                      { value: 'cancelled', label: 'CANCELLED' },
                    ]}
                    minWidth="180px"
                  />
                  <button
                    type="button"
                    onClick={handleSaveStatus}
                    disabled={saving}
                    className={`${btnPri} text-sm px-4 disabled:opacity-50`}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusValue(request.status || '')
                      setEditingStatus(false)
                    }}
                    className={`${btnSec} text-sm px-4`}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block px-4 py-2.5 rounded-xl font-semibold ${getStatusColor(request.status)} ${getStatusBgColor(request.status)} border border-current border-opacity-20`}
                    title={request.status?.toLowerCase() === 'cancelled' && request.cancellation_reason ? request.cancellation_reason : undefined}
                  >
                    {(request.status || 'new').toUpperCase()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingStatus(true)}
                    className="text-secondary hover:text-accent-theme transition-colors p-2 rounded-lg hover:bg-[var(--bg-btn-secondary)]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <div className="text-left md:text-right shrink-0">
              <p className={lbl}>Created</p>
              <p className="text-primary font-medium text-lg">{formatDate(request.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Travel Information */}
        <div className={card}>
              <h2 className="text-left text-2xl font-semibold text-accent-theme mb-8">Travel information</h2>
              {editingClientInfo ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                    <div>
                      <label className={lbl}>Start date</label>
                      <input
                        type="date"
                        value={startDateValue}
                        onChange={(e) => setStartDateValue(e.target.value)}
                        className={`${field} [color-scheme:dark]`}
                      />
                    </div>
                    <div>
                      <label className={lbl}>End date</label>
                      <input
                        type="date"
                        value={endDateValue}
                        onChange={(e) => setEndDateValue(e.target.value)}
                        min={startDateValue || undefined}
                        className={`${field} [color-scheme:dark]`}
                      />
                    </div>
                    <div>
                      <p className={lbl}>Duration</p>
                      <p className="text-secondary py-3">
                        {startDateValue && endDateValue
                          ? (() => {
                              const start = new Date(startDateValue)
                              const end = new Date(endDateValue)
                              if (end >= start) {
                                const diffTime = Math.abs(end.getTime() - start.getTime())
                                const diffDays = inclusiveDaysFromMs(diffTime)
                                return `${diffDays} days`
                              }
                              return 'Invalid'
                            })()
                          : request.duration
                          ? `${request.duration} days`
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    <div>
                      <label className={lbl}>Number of adults</label>
                      <input
                        type="number"
                        min="1"
                        value={numberOfAdultsValue}
                        onChange={(e) => setNumberOfAdultsValue(e.target.value)}
                        className={field}
                      />
                    </div>
                    <div>
                      <label className={lbl}>Number of children</label>
                      <input
                        type="number"
                        min="0"
                        value={numberOfChildrenValue}
                        onChange={(e) => {
                          const count = parseInt(e.target.value) || 0
                          setNumberOfChildrenValue(e.target.value)
                          if (count >= 1) {
                            setChildrenAgesValue(prev => {
                              const newAges = [...prev]
                              while (newAges.length < count) {
                                newAges.push('')
                              }
                              return newAges.slice(0, count)
                            })
                          } else {
                            setChildrenAgesValue([])
                          }
                        }}
                        className={field}
                      />
                    </div>
                  </div>
                  {parseInt(numberOfChildrenValue) > 0 && (
                    <div>
                      <label className={lbl}>
                        {parseInt(numberOfChildrenValue) === 1 ? 'Child age (years)' : 'Children ages (years)'}
                      </label>
                      <div className={`grid gap-3 ${parseInt(numberOfChildrenValue) <= 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                        {childrenAgesValue.map((age, index) => (
                          <div key={index}>
                            <label className="block text-xs text-secondary mb-1.5">
                              Child {index + 1}
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="17"
                              value={age}
                              onChange={(e) => {
                                const newAges = [...childrenAgesValue]
                                newAges[index] = e.target.value
                                setChildrenAgesValue(newAges)
                              }}
                              placeholder={`Age of child ${index + 1}`}
                              className={field}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-8 text-left">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                    <div>
                      <p className={lbl}>Start date</p>
                      <p className="text-primary">{formatDate(request.start_date)}</p>
                    </div>
                    <div>
                      <p className={lbl}>End date</p>
                      <p className="text-primary">{formatDate(request.end_date)}</p>
                    </div>
                    <div>
                      <p className={lbl}>Duration</p>
                      <p className="text-primary">{request.duration ? `${request.duration} days` : 'N/A'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    <div>
                      <p className={lbl}>Number of adults</p>
                      <p className="text-primary">{request.number_of_adults ?? 'N/A'}</p>
                    </div>
                    <div>
                      <p className={lbl}>Number of children</p>
                      <p className="text-primary">{request.number_of_children ?? 'N/A'}</p>
                    </div>
                    {request.children_ages && (() => {
                      try {
                        const ages = JSON.parse(request.children_ages)
                        if (Array.isArray(ages) && ages.length > 0) {
                          return (
                            <div className="md:col-span-2">
                              <p className={lbl}>Children ages</p>
                              <p className="text-secondary">
                                {ages.map((age: number, index: number) => (
                                  <span key={index}>
                                    Child {index + 1}: {age} years{index < ages.length - 1 ? ', ' : ''}
                                  </span>
                                ))}
                              </p>
                            </div>
                          )
                        }
                      } catch {}
                      return null
                    })()}
                  </div>
                </div>
              )}
        </div>

        {/* Additional preferences */}
        <div className={card}>
              <h2 className="text-left text-2xl font-semibold text-accent-theme mb-8">Additional preferences</h2>
              {editingClientInfo ? (
                <textarea
                  value={additionalPreferencesValue}
                  onChange={(e) => setAdditionalPreferencesValue(e.target.value)}
                  rows={6}
                  className={`${field} resize-y min-h-[160px]`}
                  placeholder="e.g., honeymoon, wildlife safari, luxury focus, train journeys, ayurveda retreat, family friendly, adventure"
                />
              ) : (
                <div className="rounded-xl border border-accent bg-inner-theme p-6 md:p-8">
                  <p className="text-secondary whitespace-pre-wrap leading-relaxed">
                    {request.additional_preferences || 'No preferences specified'}
                  </p>
                </div>
              )}
        </div>

        {/* Notes */}
        <div className={card}>
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-left text-2xl font-semibold text-accent-theme">Notes</h2>
              </div>
              {editingNotes ? (
                <div className="space-y-6">
                  <textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    className={`${field} resize-y min-h-[160px]`}
                    placeholder="Add internal notes…"
                  />
                  <div className="flex flex-wrap gap-4">
                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      disabled={saving}
                      className={`${btnPri} disabled:opacity-50`}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNotesValue(request.notes || '')
                        setEditingNotes(false)
                      }}
                      className={btnSec}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-accent bg-inner-theme p-6 md:p-8 text-left">
                  {request.notes ? (
                    <p className="text-secondary whitespace-pre-wrap leading-relaxed">{request.notes}</p>
                  ) : (
                    <p className="text-secondary italic">No notes added yet.</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingNotes(true)}
                    className="mt-6 text-sm font-semibold text-accent-theme hover:text-[#d4b35c] transition-colors"
                  >
                    {request.notes ? 'Edit notes' : 'Add notes'}
                  </button>
                </div>
              )}
        </div>

        <div className="w-full flex flex-col gap-10">
        {/* Follow-up email */}
        {request.email && (
          <div className={card}>
            <h2 className="text-left text-2xl font-semibold text-accent-theme mb-2 flex items-center gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--accent-gold)]/15 text-accent-theme shrink-0">
                <Mail className="w-5 h-5" />
              </span>
              Follow-up email
            </h2>
            <p className="text-secondary mb-8 max-w-2xl leading-relaxed text-sm text-left">
              Friendly templates with preview. Itinerary link is included when available.
            </p>
            <div className="flex flex-wrap items-end gap-6">
              <div className="min-w-[280px] flex-1 max-w-md">
                <Select
                  label="Template"
                  value={selectedTemplateId}
                  onChange={(v) => setSelectedTemplateId(v as TemplateId)}
                  options={FOLLOW_UP_TEMPLATES.map((t) => ({ value: t.id, label: t.name }))}
                  fullWidth
                />
              </div>
              <button
                type="button"
                onClick={openTemplateEmailModal}
                className={btnPri}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Preview & send follow-up
              </button>
              {templateEmailSuccess && (
                <span className="text-green-400 font-medium flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Sent!
                </span>
              )}
            </div>

            {request.follow_up_emails_sent && request.follow_up_emails_sent.length > 0 && (
              <div className="mt-10 pt-10 border-t border-accent">
                <button
                  type="button"
                  onClick={() => setFollowUpEmailsSentExpanded((v) => !v)}
                  className="flex items-center justify-between w-full text-left gap-4"
                >
                  <h3 className="text-lg font-semibold text-accent-theme">
                    Follow-up emails sent ({request.follow_up_emails_sent.length})
                  </h3>
                  <svg
                    className={`w-5 h-5 text-secondary shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${followUpEmailsSentExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div
                  className={`grid ${followUpEmailsSentExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                  style={{ transition: 'grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <ul className="space-y-3 mt-4">
                      {[...request.follow_up_emails_sent]
                        .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
                        .map((entry, index) => (
                          <li
                            key={`${entry.sent_at}-${index}`}
                            className="flex flex-wrap items-baseline gap-3 py-2.5 text-secondary border-b border-accent last:border-0"
                          >
                            <time className="text-sm text-secondary shrink-0" dateTime={entry.sent_at}>
                              {formatDateTime(entry.sent_at)}
                            </time>
                            <span className="text-zinc-600">·</span>
                            <span className="text-primary" title={entry.subject}>
                              {entry.template_name}: {entry.subject}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {request.link_opens && request.link_opens.length > 0 && (
              <div className="mt-10 pt-10 border-t border-accent">
                <button
                  type="button"
                  onClick={() => setLinkOpensExpanded((v) => !v)}
                  className="flex items-center justify-between w-full text-left gap-4"
                >
                  <h3 className="text-lg font-semibold text-accent-theme">
                    Link opens ({request.link_opens.length})
                  </h3>
                  <svg
                    className={`w-5 h-5 text-secondary shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${linkOpensExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div
                  className={`grid ${linkOpensExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                  style={{ transition: 'grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <p className="text-sm text-secondary mt-4 mb-4 text-left">When the client opened the itinerary link (most recent first).</p>
                    <ul className="space-y-1">
                      {[...request.link_opens]
                        .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
                        .map((entry, index) => (
                          <li
                            key={`${entry.opened_at}-${index}`}
                            className="flex flex-wrap items-baseline gap-3 py-2.5 text-secondary border-b border-accent last:border-0"
                          >
                            <time className="text-sm text-secondary shrink-0" dateTime={entry.opened_at}>
                              {formatDateTime(entry.opened_at)}
                            </time>
                            {entry.option_index !== undefined && entry.option_index !== null && (
                              <>
                                <span className="text-zinc-600">·</span>
                                <span className="text-secondary">Option {entry.option_index + 1}</span>
                              </>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Itinerary options */}
        <div className={card}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-10 text-left">
            <h2 className="text-2xl font-semibold text-accent-theme flex items-center gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--accent-gold)]/15 text-accent-theme shrink-0">
                <Map className="w-5 h-5" />
              </span>
              Itinerary options
            </h2>
            {!isCancelled && (
              <div className="flex gap-2 flex-wrap">
                {[0, 1, 2].map((optionIndex) => {
                  const optionExists = itineraryOptions[optionIndex] !== null && itineraryOptions[optionIndex] !== undefined
                  const isGenerating = generatingOption === optionIndex
                  return (
                    <button
                      key={optionIndex}
                      type="button"
                      onClick={() => handleGenerateSingleOption(optionIndex)}
                      disabled={isGenerating || generatingItinerary}
                      className={`${btnPri} text-sm px-4 disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {isGenerating ? (
                        <>
                          <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-black"></div>
                          Generating...
                        </>
                      ) : optionExists ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Regenerate Option {optionIndex + 1}
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Generate Option {optionIndex + 1}
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            {isCancelled && (
              <p className="text-sm text-secondary italic">Itinerary generation disabled for cancelled trips</p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {[0, 1, 2].map((index) => {
              const option = itineraryOptions[index]
              const optionExists = option !== null && option !== undefined
              const isGenerating = generatingOption === index
              const isSelected = request.selected_option === index

              if (!optionExists && !isGenerating) {
                return (
                  <ItineraryPlaceholder
                    key={index}
                    index={index}
                    isCancelled={isCancelled}
                    generating={generatingOption !== null || generatingItinerary}
                    onGenerate={() => handleGenerateSingleOption(index)}
                  />
                )
              }
              if (isGenerating) {
                return <ItineraryGenerating key={index} index={index} />
              }
              if (!option) return null
              return (
                <ItineraryCard
                  key={index}
                  index={index}
                  option={option}
                  isSelected={isSelected}
                  isRegenerating={generatingOption === index}
                  isCancelled={isCancelled}
                  selectingOption={selectingOption}
                  onSelect={() => handleSelectOption(index)}
                  onRegenerate={() => handleGenerateSingleOption(index)}
                  onPreview={async () => {
                    const opt = request.itinerary_options?.options?.[index] as ItineraryOption | null | undefined
                    const hasNoImages = !opt?.images || opt.images.length === 0
                    let toApply = defaultImagesByOption[index]
                    if (hasNoImages) {
                      if (!toApply?.length) {
                        try {
                          const libRes = await fetch('/api/image-library')
                          const libData = await libRes.json()
                          const paths: string[] = Array.isArray(libData.paths) ? libData.paths : []
                          toApply = paths.map((p: string) => ({ src: p, type: 'default' as const }))
                          if (toApply.length) setDefaultImagesByOption((prev) => ({ ...prev, [index]: toApply }))
                        } catch (_) {}
                      }
                      if (toApply?.length) await handleUpdateItineraryImages(index, toApply)
                    }
                    setPreviewingOptionIndex(index)
                    setClientPreviewOpen(true)
                  }}
                />
              )
            })}
          </div>

          {/* Manual itineraries: same card format, editable, with public link */}
          {(() => {
            const allOpts = getOptionsArray()
            const manualIndices = allOpts.length > 3 ? Array.from({ length: allOpts.length - 3 }, (_, i) => 3 + i) : []
            return (
              <div className="mt-10 pt-10 border-t border-accent">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 text-left">
                  <h3 className="text-xl font-semibold text-accent-theme">Manual itineraries</h3>
                  {!isCancelled && (
                    <button
                      type="button"
                      onClick={handleAddManualItinerary}
                      className={`${btnPri} text-sm shrink-0`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add manual itinerary
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {manualIndices.map((index) => {
                    const option = allOpts[index] as ItineraryOption | null
                    if (!option) return null
                    const isSelected = request.selected_option === index
                    const daysRaw = (option as { days?: string | { day: number; title: string; location: string; activities?: string[] }[] }).days
                    const draft = manualDrafts[index] ?? {
                      title: option.title || '',
                      summary: option.summary || '',
                      days: typeof daysRaw === 'string' ? daysRaw : (Array.isArray(daysRaw) ? daysRaw.map((d: any) => `Day ${d.day}: ${d.title} - ${d.location}\n${(d.activities || []).join('\n')}`).join('\n\n') : ''),
                    }
                    const baseUrl = 'https://admin.lankalux.com'
                    const publicLink = request.public_token != null ? baseUrl + '/itinerary/' + request.public_token + '/' + index : null
                    return (
                      <div
                        key={index}
                        className={`rounded-2xl border bg-inner-theme p-6 md:p-8 flex flex-col gap-6 transition-all hover:-translate-y-0.5 ${isSelected ? 'border-[color:var(--accent-gold)] ring-2 ring-[color:var(--accent-gold)]/30 shadow-lg' : 'border-accent'}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-secondary uppercase tracking-wider">Manual {index - 2}</span>
                          {isSelected && (
                            <span className="px-3 py-1 bg-accent text-black text-xs font-semibold rounded-lg">Selected</span>
                          )}
                        </div>
                        <div className="space-y-5 flex-1 text-left">
                          <div>
                            <label className={lbl}>Title</label>
                            <input
                              type="text"
                              value={draft.title}
                              onChange={(e) => setManualDrafts((d) => ({ ...d, [index]: { ...draft, title: e.target.value } }))}
                              className={`${field} text-sm py-2.5`}
                              placeholder="Itinerary title"
                            />
                          </div>
                          <div>
                            <label className={lbl}>Summary</label>
                            <textarea
                              value={draft.summary}
                              onChange={(e) => setManualDrafts((d) => ({ ...d, [index]: { ...draft, summary: e.target.value } }))}
                              rows={2}
                              className={`${field} text-sm py-2.5 resize-y`}
                              placeholder="Short summary"
                            />
                          </div>
                          <div>
                            <label className={lbl}>Days & itinerary</label>
                            <textarea
                              value={draft.days}
                              onChange={(e) => setManualDrafts((d) => ({ ...d, [index]: { ...draft, days: e.target.value } }))}
                              rows={6}
                              className={`${field} text-sm font-mono resize-y`}
                              placeholder="Day 1: ...&#10;Day 2: ..."
                            />
                          </div>
                          <div className="rounded-xl border border-accent bg-inner-deep p-5">
                            <ImageManager
                              items={normalizeManagedImages((option as ItineraryOption).images)}
                              onChange={(items) => void handleUpdateManualItineraryImages(index, items)}
                              requestId={request.id}
                              sectionLabel="Images"
                              disabled={savingManualOption === index || isCancelled}
                            />
                          </div>
                        </div>
                        {publicLink && isSelected && (
                          <div className="rounded-lg border border-accent bg-inner-deep p-4 text-xs text-secondary break-all">
                            Public link:{' '}
                            <a href={publicLink} target="_blank" rel="noopener noreferrer" className="text-accent-theme hover:underline">
                              {publicLink}
                            </a>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-3 mt-auto pt-2">
                          <button
                            type="button"
                            onClick={() => handleSaveManualItinerary(index, draft)}
                            disabled={savingManualOption === index}
                            className={`${btnPri} text-sm px-4 disabled:opacity-50`}
                          >
                            {savingManualOption === index ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectOption(index)}
                            disabled={selectingOption !== null}
                            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${isSelected ? 'bg-amber-700/90 hover:bg-amber-600 text-white' : `${btnSec}`}`}
                          >
                            {selectingOption === index ? '…' : isSelected ? 'Deselect' : 'Select'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveManualItinerary(index)}
                            className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold text-red-200 bg-red-950/50 border border-red-900/50 hover:bg-red-900/40"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Hotel options */}
        <div className={card}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-10 text-left">
            <h2 className="text-2xl font-semibold text-accent-theme flex items-center gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--accent-gold)]/15 text-accent-theme shrink-0">
                <Building2 className="w-5 h-5" />
              </span>
              Hotel options
            </h2>
            <Button
              onClick={() => {
                setEditingHotel(null)
                setHotelModalOpen(true)
              }}
              disabled={savingHotels || isCancelled}
              className="shrink-0"
            >
              + Add hotel
            </Button>
          </div>
          {hotels.length === 0 ? (
            <p className="text-secondary text-sm py-10 px-6 text-center border border-dashed border-accent rounded-2xl bg-inner-theme/50">
              No hotels yet. Add properties the client can compare and select.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {hotels.map((h) => (
                <HotelCard
                  key={h.id}
                  hotel={h}
                  selected={selectedHotelId === h.id}
                  onSelect={() => {
                    void persistHotelOptions(hotels, selectedHotelId === h.id ? null : h.id)
                  }}
                  onEdit={() => {
                    setEditingHotel(h)
                    setHotelModalOpen(true)
                  }}
                  onDelete={() => {
                    if (!confirm(`Remove “${h.name}”?`)) return
                    const next = hotels.filter((x) => x.id !== h.id)
                    const nextSel = selectedHotelId === h.id ? null : selectedHotelId
                    void persistHotelOptions(next, nextSel)
                  }}
                  disabled={savingHotels}
                  requestId={request.id}
                  onRoomImagesChange={(items) => {
                    const next = hotels.map((x) => (x.id === h.id ? { ...x, images: items } : x))
                    void persistHotelOptions(next, selectedHotelId)
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Send to client */}
        <div className={`${card} ring-1 ring-[color:var(--border-accent)]`}>
          <h2 className="text-left text-2xl font-semibold text-accent-theme mb-8 flex items-center gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--accent-gold)]/15 text-accent-theme shrink-0">
              <Send className="w-5 h-5" />
            </span>
            Send to client
          </h2>
          {sendSuccess && (
            <div className="mb-6 rounded-xl border border-emerald-700/50 bg-emerald-950/40 px-4 py-3 text-emerald-300 text-sm font-medium flex items-center gap-2">
              <span className="text-lg">✓</span> Message sent successfully.
            </div>
          )}
          <div className="space-y-8 text-left">
            <div className="flex flex-col gap-5">
              <label className="flex items-center gap-4 cursor-pointer group w-fit">
                <span
                  className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${includeItinerarySend ? 'border-[color:var(--accent-gold)] bg-accent' : 'border-theme bg-inner-theme'}`}
                >
                  <input
                    type="checkbox"
                    checked={includeItinerarySend}
                    onChange={(e) => setIncludeItinerarySend(e.target.checked)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                  {includeItinerarySend && (
                    <svg className="h-3 w-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-primary font-medium">Include itinerary</span>
              </label>
              <label className="flex items-center gap-4 cursor-pointer group w-fit">
                <span
                  className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${includeHotelSend ? 'border-[color:var(--accent-gold)] bg-accent' : 'border-theme bg-inner-theme'}`}
                >
                  <input
                    type="checkbox"
                    checked={includeHotelSend}
                    onChange={(e) => setIncludeHotelSend(e.target.checked)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                  {includeHotelSend && (
                    <svg className="h-3 w-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-primary font-medium">Include hotel</span>
              </label>
            </div>

            {includeItinerarySend && (
              <div className="rounded-2xl border border-accent bg-inner-theme p-6 md:p-8 space-y-6">
                <p className="text-xs font-medium uppercase tracking-wider text-secondary">On public itinerary page</p>
                <div className="flex flex-wrap gap-8">
                  <label className="flex items-center gap-3 text-sm text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeVehicleInItinerary}
                      onChange={(e) => {
                        setIncludeVehicleInItinerary(e.target.checked)
                        if (!e.target.checked) setSendVehiclePhotos([])
                      }}
                      className="rounded border-accent text-accent-theme"
                    />
                    Include vehicle
                  </label>
                  <label className="flex items-center gap-3 text-sm text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includePriceInItinerary}
                      onChange={(e) => setIncludePriceInItinerary(e.target.checked)}
                      className="rounded border-accent text-accent-theme"
                    />
                    Include price
                  </label>
                </div>
                {includeVehicleInItinerary && (
                  <div className="space-y-4">
                    <div className="max-w-md">
                      <Select
                        label="Vehicle"
                        value={sendVehicleId}
                        onChange={setSendVehicleId}
                        options={[
                          { value: '', label: 'Select vehicle' },
                          ...FLEET_VEHICLES.map((v) => ({ value: v.id, label: v.name })),
                        ]}
                        placeholder="Select vehicle"
                        fullWidth
                      />
                    </div>
                    <div>
                      <p className="label-theme mb-2">Vehicle photos for public link (select 3–4 from fleet)</p>
                      <div className="flex flex-wrap gap-2">
                        {getAllFleetImages().map((src) => {
                          const selected = sendVehiclePhotos.includes(src)
                          const count = sendVehiclePhotos.length
                          const canAdd = count < 4 && !selected
                          const canRemove = selected
                          const toggle = () => {
                            if (selected) {
                              setSendVehiclePhotos((prev) => prev.filter((p) => p !== src))
                            } else if (count < 4) {
                              setSendVehiclePhotos((prev) => [...prev, src].slice(0, 4))
                            }
                          }
                          return (
                            <button
                              key={src}
                              type="button"
                              onClick={toggle}
                              disabled={!canAdd && !canRemove}
                              className={`relative rounded-lg overflow-hidden border-2 transition-all w-20 h-20 shrink-0 ${
                                selected
                                  ? 'border-[var(--accent-gold)] ring-2 ring-[var(--accent-gold)]/50'
                                  : 'border-theme opacity-80 hover:opacity-100'
                              } ${!canAdd && !canRemove ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={src} alt="" className="w-full h-full object-cover" />
                              {selected && (
                                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-lg font-bold">
                                  {sendVehiclePhotos.indexOf(src) + 1}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-secondary text-xs mt-2">
                        {sendVehiclePhotos.length < 3
                          ? `Select 3–4 photos (${sendVehiclePhotos.length} selected). Public link will use vehicle default images until you pick 3–4.`
                          : sendVehiclePhotos.length <= 4
                            ? `${sendVehiclePhotos.length} photos selected — these will show on the public link.`
                            : 'Max 4 photos. Deselect one to change.'}
                      </p>
                    </div>
                  </div>
                )}
                {includePriceInItinerary && (
                  <div>
                    <label className={lbl}>Price</label>
                    <input
                      value={sendPriceValue}
                      onChange={(e) => setSendPriceValue(e.target.value)}
                      placeholder="e.g. USD 2,500"
                      className={`${field} max-w-xs text-sm py-2.5`}
                    />
                  </div>
                )}
              </div>
            )}

            <p className="text-secondary text-sm">
              You must open the client preview before sending. Email and WhatsApp are only available from the preview screen.
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-4">
              <Button
                onClick={async () => {
                  const idx = request.selected_option !== null && request.selected_option !== undefined ? request.selected_option : 0
                  const opt = request.itinerary_options?.options?.[idx] as ItineraryOption | null | undefined
                  const hasNoImages = !opt?.images || opt.images.length === 0
                  let toApply = defaultImagesByOption[idx]
                  if (hasNoImages) {
                    if (!toApply?.length) {
                      try {
                        const libRes = await fetch('/api/image-library')
                        const libData = await libRes.json()
                        const paths: string[] = Array.isArray(libData.paths) ? libData.paths : []
                        toApply = paths.map((p: string) => ({ src: p, type: 'default' as const }))
                        if (toApply.length) setDefaultImagesByOption((prev) => ({ ...prev, [idx]: toApply }))
                      } catch (_) {}
                    }
                    if (toApply?.length) await handleUpdateItineraryImages(idx, toApply)
                  }
                  setPreviewingOptionIndex(idx)
                  setClientPreviewOpen(true)
                }}
                className="min-w-[200px]"
              >
                <Send className="w-4 h-4" />
                Preview & send
              </Button>
              {request.sent_at && request.last_sent_at && (
                <span className="text-xs text-secondary">
                  Last email: {formatDateTime(request.last_sent_at)}
                </span>
              )}
            </div>
            {!request.email && (
              <p className="text-amber-600/90 text-sm">Add a client email to enable sending.</p>
            )}
          </div>
        </div>

        </div>

        <ClientViewPreviewModal
          open={clientPreviewOpen}
          onClose={() => {
            setClientPreviewOpen(false)
            setPreviewingOptionIndex(null)
          }}
          clientName={request.client_name || 'Valued Client'}
          includeItinerary={includeItinerarySend}
          itineraryOption={
            includeItinerarySend
              ? (request.itinerary_options?.options?.[previewingOptionIndex ?? request.selected_option ?? 0] as import('@/components/requests/itinerary-types').ItineraryOption | null | undefined) ?? null
              : null
          }
          includeHotel={includeHotelSend}
          hotel={includeHotelSend && selectedHotel ? selectedHotel : null}
          startDate={request.start_date}
          endDate={request.end_date}
          duration={request.duration}
          vehicle={
            includeItinerarySend && includeVehicleInItinerary && sendVehicleId
              ? (getFleetVehicleById(sendVehicleId) ?? null)
              : null
          }
          price={includeItinerarySend && includePriceInItinerary ? sendPriceValue : null}
          defaultItineraryImages={defaultImagesByOption[previewingOptionIndex ?? request.selected_option ?? 0] ?? []}
          requestId={request.id}
          onItineraryImagesChange={(items) => {
            const idx = previewingOptionIndex ?? request.selected_option
            if (idx != null) void handleUpdateItineraryImages(idx, items)
          }}
          savingImages={savingItineraryImages === (previewingOptionIndex ?? request.selected_option ?? 0)}
          onSendEmail={() => void handleSendItinerary()}
          onSendWhatsApp={() => {
            handleWhatsAppShare()
            setClientPreviewOpen(false)
          }}
          sending={sendingItinerary}
          hasWhatsApp={!!request.whatsapp?.trim()}
        />

        <HotelModal
          open={hotelModalOpen}
          onClose={() => {
            setHotelModalOpen(false)
            setEditingHotel(null)
          }}
          requestId={request.id}
          initial={editingHotel}
          onSave={(h) => {
            const next = editingHotel ? hotels.map((x) => (x.id === h.id ? h : x)) : [...hotels, h]
            void persistHotelOptions(next, selectedHotelId)
          }}
        />

        {/* Sent Itinerary Section - Show if any options have been sent */}
        {(() => {
          const hasSentAt = !!request.sent_at
          const hasOptions = !!request.itinerary_options?.options
          const hasSentOptions = request.sent_options && Array.isArray(request.sent_options) && request.sent_options.length > 0
          const shouldShow = hasSentAt && hasOptions && (hasSentOptions || request.last_sent_option !== null)
          
          if (!shouldShow) return null
          
          return (
            <div className={card}>
              <button
                type="button"
                onClick={() => setSentItineraryExpanded((v) => !v)}
                className="flex items-center justify-between w-full text-left gap-4"
              >
                <div className="min-w-0 text-left">
                  <h2 className="text-2xl font-semibold text-accent-theme">Sent itinerary</h2>
                  {request.sent_at && (
                    <p className="text-sm text-secondary mt-2 leading-relaxed">
                      First sent: {formatDateTime(request.sent_at)}
                      {request.email_sent_count && request.email_sent_count > 1 && (
                        <span className="ml-2">• Sent {request.email_sent_count} time{request.email_sent_count > 1 ? 's' : ''}</span>
                      )}
                      {request.last_sent_at && (
                        <span className="ml-2">• Last sent: {formatDateTime(request.last_sent_at)}</span>
                      )}
                    </p>
                  )}
                </div>
                <svg
                  className={`w-6 h-6 text-secondary shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${sentItineraryExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div
                className={`grid ${sentItineraryExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                style={{ transition: 'grid-template-rows 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
              >
                <div className="min-h-0 overflow-hidden">
              {/* List of All Sent Options - Show full details for each */}
              {(() => {
                // Get sent options from sent_options array, or fallback to last_sent_option if array is empty
                let sentOptionsList: any[] = []
                
                if (request.sent_options && Array.isArray(request.sent_options) && request.sent_options.length > 0) {
                  sentOptionsList = request.sent_options
                  // Sort by sent_at (most recent first) to ensure proper display order
                  sentOptionsList.sort((a: any, b: any) => {
                    const dateA = new Date(a.sent_at || 0).getTime()
                    const dateB = new Date(b.sent_at || 0).getTime()
                    return dateB - dateA // Most recent first
                  })
                } else if (request.last_sent_option !== null && request.last_sent_option !== undefined && request.sent_at) {
                  // Fallback: if sent_options is empty but last_sent_option exists, create an entry
                  sentOptionsList = [{
                    option_index: request.last_sent_option,
                    sent_at: request.last_sent_at || request.sent_at,
                    option_title: null
                  }]
                }
                
                if (sentOptionsList.length === 0) return null
                
                // Show note if there are 10 or more entries (indicating we're showing the most recent 10)
                const showLimitNote = sentOptionsList.length >= 10
                
                return (
                <div className="mb-4 mt-10 pt-10 border-t border-accent text-left">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
                    <h3 className="text-xl font-semibold text-accent-theme">All sent options ({sentOptionsList.length})</h3>
                    {showLimitNote && (
                      <span className="text-xs text-secondary">Showing most recent 10</span>
                    )}
                  </div>
                  <div className="space-y-8">
                    {sentOptionsList.map((sentOption: any, index: number) => {
                      // Ensure option_index is a valid number
                      const optionIndex = typeof sentOption.option_index === 'number' ? sentOption.option_index : null
                      const hotelSnap = sentOption.hotel_snapshot
                      if (
                        (optionIndex === null || optionIndex === undefined) &&
                        (!hotelSnap || typeof hotelSnap !== 'object')
                      ) {
                        return null
                      }

                      const option =
                        optionIndex !== null && optionIndex !== undefined
                          ? request.itinerary_options?.options?.[optionIndex]
                          : undefined
                      let optionTitle =
                        optionIndex !== null && optionIndex !== undefined
                          ? `Option ${optionIndex + 1}`
                          : hotelSnap && typeof (hotelSnap as { name?: string }).name === 'string'
                            ? `Hotel: ${(hotelSnap as { name: string }).name}`
                            : 'Email sent'
                      let optionSummary = ''
                      let optionDays: string = ''

                      if (option) {
                        if (typeof option.title === 'string') {
                          optionTitle = option.title
                        }
                        if (typeof option.summary === 'string') {
                          optionSummary = option.summary
                        }
                        // Format days properly
                        if (Array.isArray(option.days)) {
                          optionDays = option.days.map((day: any) => 
                            `Day ${day.day}: ${day.title} - ${day.location}\n${day.activities?.map((act: string) => `  • ${act}`).join('\n') || ''}`
                          ).join('\n\n')
                        } else if (typeof option.days === 'string') {
                          optionDays = option.days
                        }
                      } else if (sentOption.option_title && typeof sentOption.option_title === 'string') {
                        optionTitle = sentOption.option_title
                      }

                      const sentAt = typeof sentOption.sent_at === 'string' ? sentOption.sent_at : null
                      // Use stored URL if available, otherwise generate it
                      let itineraryUrl = ''
                      if (sentOption.itinerary_url && typeof sentOption.itinerary_url === 'string') {
                        itineraryUrl = sentOption.itinerary_url
                      } else if (
                        request.public_token &&
                        typeof request.public_token === 'string' &&
                        optionIndex !== null &&
                        optionIndex !== undefined
                      ) {
                        const baseUrl = 'https://admin.lankalux.com'
                        itineraryUrl = baseUrl + '/itinerary/' + request.public_token + '/' + optionIndex
                      }

                      return (
                        <div
                          key={`sent-option-${index}-${optionIndex ?? 'h'}-${(hotelSnap as { name?: string })?.name ?? ''}`}
                          className="rounded-2xl border border-accent bg-inner-theme p-6 md:p-8 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-lg hover:shadow-black/30"
                        >
                          <div className="space-y-6">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-3 mb-2">
                                  <h4 className="text-xl font-semibold text-accent-theme">{String(optionTitle)}</h4>
                                  {sentAt && (
                                    <span className="text-xs text-secondary">
                                      Sent: {formatDateTime(sentAt)}
                                    </span>
                                  )}
                                </div>
                                {optionSummary && (
                                  <p className="text-secondary text-sm mt-2 leading-relaxed">{optionSummary}</p>
                                )}
                              </div>
                            </div>

                            {optionDays && (
                              <div>
                                <label className={lbl}>Day-by-day itinerary</label>
                                <div className="rounded-xl border border-accent bg-inner-deep p-5 max-h-64 overflow-y-auto">
                                  <p className="text-secondary text-sm whitespace-pre-wrap font-mono leading-relaxed">
                                    {optionDays}
                                  </p>
                                </div>
                              </div>
                            )}

                            {option && typeof option.total_kilometers === 'number' && (
                              <div className="pt-6 border-t border-accent">
                                <label className={lbl}>Total kilometers</label>
                                <div className="rounded-xl border border-accent bg-inner-deep p-4">
                                  <p className="text-accent-theme text-lg font-semibold">
                                    {option.total_kilometers.toLocaleString()} km
                                  </p>
                                </div>
                              </div>
                            )}

                            {hotelSnap && typeof hotelSnap === 'object' && (hotelSnap as { name?: string }).name && (
                              <div className="pt-6 border-t border-accent">
                                <label className={lbl}>Hotel in this send</label>
                                <p className="text-primary text-sm font-medium">
                                  {(hotelSnap as { name: string }).name}
                                  {(hotelSnap as { location?: string }).location
                                    ? ` — ${(hotelSnap as { location: string }).location}`
                                    : ''}
                                </p>
                              </div>
                            )}

                            {/* Public Link */}
                            {itineraryUrl && (
                              <div className="pt-6 border-t border-accent">
                                <label className={lbl}>Public itinerary link</label>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                  <input
                                    type="text"
                                    readOnly
                                    value={itineraryUrl}
                                    className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-inner-deep border border-accent text-secondary text-sm font-mono"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(itineraryUrl)
                                      alert('Link copied to clipboard!')
                                    }}
                                    className={`${btnSec} text-sm shrink-0`}
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    Copy
                                  </button>
                                  <a
                                    href={itineraryUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`${btnPri} text-sm shrink-0 no-underline`}
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    View
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                )
              })()}
                </div>
              </div>

            </div>
          )
        })()}

      {/* Follow-up email preview modal: edit subject and body then send */}
      {templateEmailModalOpen && request?.email && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => !sendingTemplateEmail && setTemplateEmailModalOpen(false)}
        >
          <div
            className="rounded-2xl bg-card border border-accent shadow-card max-w-2xl w-full max-h-[90vh] flex flex-col transition-colors duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 md:p-8 border-b border-accent text-left">
              <h2 className="text-xl font-semibold text-accent-theme">Preview email</h2>
              <p className="text-sm text-secondary mt-2">Edit the subject and message below, then send.</p>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto flex-1 space-y-6 text-left">
              <div>
                <label className={lbl}>To</label>
                <p className="text-primary font-medium">{request.email}</p>
              </div>
              <div>
                <label className={lbl}>Subject</label>
                <input
                  type="text"
                  value={previewSubject}
                  onChange={(e) => setPreviewSubject(e.target.value)}
                  className={field}
                  placeholder="Email subject"
                />
              </div>
              <div>
                <label className={lbl}>Message</label>
                <p className="text-xs text-secondary mb-2">A “View your itinerary” button and our signature will be added automatically.</p>
                <textarea
                  value={previewBody}
                  onChange={(e) => setPreviewBody(e.target.value)}
                  rows={12}
                  className={`${field} resize-y font-mono text-sm min-h-[200px]`}
                  placeholder="Email body (plain text)"
                />
              </div>
            </div>
            <div className="p-6 md:p-8 border-t border-accent flex flex-wrap justify-end gap-4">
              <button
                type="button"
                onClick={() => !sendingTemplateEmail && setTemplateEmailModalOpen(false)}
                disabled={sendingTemplateEmail}
                className={`${btnSec} disabled:opacity-50`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendTemplateEmail}
                disabled={sendingTemplateEmail}
                className={`${btnPri} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {sendingTemplateEmail ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-black"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Send email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation reason modal - in-app styled, no browser prompt */}
      {cancellationReasonModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => {
            setCancellationReasonModalOpen(false)
            setCancellationReasonInput('')
            setCancellationReasonPending(null)
          }}
        >
          <div
            className="rounded-2xl bg-card border border-accent shadow-card max-w-md w-full transition-colors duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 md:p-8 border-b border-accent text-left">
              <h2 className="text-xl font-semibold text-accent-theme">Reason for cancellation</h2>
              <p className="text-sm text-secondary mt-2">Optional. This will be shown on the request and dashboard.</p>
            </div>
            <div className="p-6 md:p-8 text-left">
              <label className={lbl}>Reason (optional)</label>
              <textarea
                value={cancellationReasonInput}
                onChange={(e) => setCancellationReasonInput(e.target.value)}
                rows={3}
                placeholder="e.g. Client postponed trip or budget change"
                className={`${field} resize-y`}
                autoFocus
              />
            </div>
            <div className="p-6 md:p-8 border-t border-accent flex flex-wrap justify-end gap-4">
              <button
                type="button"
                onClick={() => {
                  setCancellationReasonModalOpen(false)
                  setCancellationReasonInput('')
                  setCancellationReasonPending(null)
                }}
                className={btnSec}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitCancellationReason}
                disabled={saving || cancelling}
                className={`${btnPri} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {saving || cancelling ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
