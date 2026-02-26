'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { FOLLOW_UP_TEMPLATES, getTemplate, type TemplateId } from '@/lib/email-templates'

interface ItineraryOption {
  title: string
  days: string
  summary: string
  total_kilometers?: number
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
  notes: string | null
  sent_at: string | null
  last_sent_at: string | null
  last_sent_option: number | null
  email_sent_count: number | null
  sent_options: any[] | null
  follow_up_emails_sent?: { sent_at: string; template_id: string; template_name: string; subject: string }[] | null
  created_at: string
  updated_at: string | null
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
            `Day ${day.day}: ${day.title} - ${day.location}\n${day.activities.map((act: string) => `  • ${act}`).join('\n')}`
          ).join('\n\n')
          setSentItineraryDays(daysText)
        } else {
          setSentItineraryDays(selectedOption.days || '')
        }
      }
    }
  }, [request, editingSentItinerary])

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
    if (!status) return 'text-gray-400'
    const statusLower = status.toLowerCase()
    if (statusLower === 'new') return 'text-blue-400'
    if (statusLower === 'follow_up') return 'text-orange-400'
    if (statusLower === 'deposit') return 'text-cyan-400'
    if (statusLower === 'sold') return 'text-green-400'
    if (statusLower === 'after_sales') return 'text-purple-400'
    if (statusLower === 'cancelled') return 'text-red-400'
    return 'text-gray-400'
  }

  const getStatusBgColor = (status: string | null) => {
    if (!status) return 'bg-gray-800'
    const statusLower = status.toLowerCase()
    if (statusLower === 'new') return 'bg-blue-900/30'
    if (statusLower === 'follow_up') return 'bg-orange-900/30'
    if (statusLower === 'deposit') return 'bg-cyan-900/30'
    if (statusLower === 'sold') return 'bg-green-900/30'
    if (statusLower === 'after_sales') return 'bg-purple-900/30'
    if (statusLower === 'cancelled') return 'bg-red-900/30'
    return 'bg-gray-800'
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

    // Auto-update status to follow_up if email_sent_count > 0
    if (requestData.email_sent_count && requestData.email_sent_count > 0 && requestData.status !== 'follow_up') {
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
          // Add 1 to make duration inclusive of both start and end dates
          // e.g., June 2-4 = 3 days (June 2, 3, 4)
          duration = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1
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

      const response = await fetch('/api/generate-single-option', {
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
      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
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

      const response = await fetch('/api/generate-itinerary', {
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

  const handleSaveStatus = async () => {
    if (!request) return

    try {
      setSaving(true)
      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          status: statusValue || null,
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
      if (updatedRequest) {
        setRequest(updatedRequest)
      }
      setEditingStatus(false)
      setSaving(false)
    } catch (err) {
      console.error('Unexpected error saving status:', err)
      alert('An unexpected error occurred. Please try again.')
      setSaving(false)
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
    const itineraryUrl = `${baseUrl}/itinerary/${request.public_token}/${request.selected_option}`

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
    if (!request || !request.public_token || request.selected_option === null || request.selected_option === undefined) {
      alert('Please select an itinerary option first to generate a shareable link.')
      return
    }

    const baseUrl = "https://admin.lankalux.com"
    const itineraryUrl = `${baseUrl}/itinerary/${request.public_token}/${request.selected_option}`

    const message = encodeURIComponent(
      `Your personalized LankaLux Sri Lanka itinerary is ready! View it here: ${itineraryUrl}`
    )

    const whatsappNumber = request.whatsapp?.replace(/[^0-9]/g, '') || ''
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

    try {
      setCancelling(true)
      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) {
        console.error('Error cancelling trip:', error)
        alert('Failed to cancel trip. Please try again.')
        setCancelling(false)
        return
      }

      const updatedRequest = await fetchRequestData(request.id)
      if (updatedRequest) {
        setRequest(updatedRequest)
        setStatusValue('cancelled')
      }
      setCancelling(false)
    } catch (err) {
      console.error('Unexpected error cancelling trip:', err)
      alert('An unexpected error occurred. Please try again.')
      setCancelling(false)
    }
  }

  const handleReopenTrip = async () => {
    if (!request) return

    try {
      setReopening(true)
      const { error } = await (supabase.from('Client Requests') as any)
        .update({
          status: 'follow_up',
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

  const handleSendItinerary = async () => {
    if (!request) return

    if (request.selected_option === null || request.selected_option === undefined) {
      alert('Please select an itinerary option first.')
      return
    }

    try {
      setSendingItinerary(true)
      setSendSuccess(false)

      const response = await fetch('/api/send-itinerary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: request.id }),
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

      // Clear success message after 3 seconds
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
        ? `https://admin.lankalux.com/itinerary/${request.public_token}/${request.selected_option}`
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
      const res = await fetch('/api/send-template-email', {
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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#d4af37] mb-4"></div>
          <p className="text-gray-400">Loading request details...</p>
        </div>
      </div>
    )
  }

  if (notFound || !request) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#d4af37] mb-4">Request not found</h1>
          <p className="text-gray-400 mb-6">The request you're looking for doesn't exist or has been removed.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-6 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200"
          >
            Back to Dashboard
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-[#0a0a0a] to-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6 bg-[#1a1a1a]/50 backdrop-blur-sm border border-[#333] rounded-xl p-4 shadow-lg animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md transition-all duration-200 flex items-center gap-2 hover:scale-105 active:scale-95"
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
          </div>
          <div className="flex items-center gap-4">
            <img 
              src="/favicon.png" 
              alt="LankaLux Logo" 
              className="h-12 w-12 object-cover"
            />
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-[#d4af37] to-[#b8941f] bg-clip-text text-transparent">
                Request Details
              </h1>
              <p className="text-gray-400 text-sm">
                Request ID: <span className="text-gray-300 font-mono">{request.id}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Cancelled Warning Banner */}
        {isCancelled && (
          <div className="mb-6 bg-red-900/20 border-2 border-red-500 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg
                  className="w-6 h-6 text-red-400"
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
                <div>
                  <h3 className="text-lg font-semibold text-red-400">Trip Cancelled</h3>
                  <p className="text-sm text-red-300">This trip has been cancelled. Itinerary generation is disabled.</p>
                </div>
              </div>
              <button
                onClick={handleReopenTrip}
                disabled={reopening}
                className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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

        {/* Request Details Card */}
        <div className="bg-[#1a1a1a]/50 backdrop-blur-sm border border-[#333] rounded-xl p-4 md:p-6 mb-6">
          <div className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center justify-between pb-6 border-b border-[#333]">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Status</p>
                {editingStatus ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={statusValue}
                      onChange={(e) => setStatusValue(e.target.value)}
                      className="px-3 py-1 bg-[#0a0a0a] border border-[#333] rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#d4af37]"
                    >
                      <option value="new">NEW</option>
                      <option value="follow_up">FOLLOW_UP</option>
                      <option value="deposit">DEPOSIT</option>
                      <option value="sold">SOLD</option>
                      <option value="after_sales">AFTER_SALES</option>
                      <option value="cancelled">CANCELLED</option>
                    </select>
                    <button
                      onClick={handleSaveStatus}
                      disabled={saving}
                      className="px-3 py-1 bg-[#d4af37] hover:bg-[#b8941f] text-black text-sm font-semibold rounded-md disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setStatusValue(request.status || '')
                        setEditingStatus(false)
                      }}
                      className="px-3 py-1 bg-[#333] hover:bg-[#444] text-white text-sm font-semibold rounded-md"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block px-4 py-2 rounded-md font-semibold ${getStatusColor(request.status)} ${getStatusBgColor(request.status)} border border-current/20`}
                    >
                      {(request.status || 'new').toUpperCase()}
                    </span>
                    <button
                      onClick={() => setEditingStatus(true)}
                      className="text-gray-400 hover:text-[#d4af37] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Created At</p>
                <p className="text-gray-300">{formatDate(request.created_at)}</p>
              </div>
            </div>

            {/* Client Information */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-[#d4af37]">Client Information</h2>
                {!editingClientInfo && (
                  <button
                    onClick={() => setEditingClientInfo(true)}
                    className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 flex items-center gap-2"
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
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                        Client Name
                      </label>
                      <input
                        type="text"
                        value={clientNameValue}
                        onChange={(e) => setClientNameValue(e.target.value)}
                        className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={emailValue}
                        onChange={(e) => setEmailValue(e.target.value)}
                        className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                        WhatsApp
                      </label>
                      <input
                        type="text"
                        value={whatsappValue}
                        onChange={(e) => setWhatsappValue(e.target.value)}
                        className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                        Origin Country
                      </label>
                      <p className="text-gray-300 py-3">{request.origin_country || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveClientInfo}
                      disabled={saving}
                      className="px-6 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
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
                      className="px-6 py-2 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Client Name</p>
                    <p className="text-white text-lg font-medium">
                      {request.client_name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Email</p>
                    <p className="text-gray-300">
                      {request.email ? (
                        <a
                          href={`mailto:${request.email}`}
                          className="text-[#d4af37] hover:text-[#b8941f] transition-colors duration-200"
                        >
                          {request.email}
                        </a>
                      ) : (
                        'N/A'
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">WhatsApp</p>
                    <p className="text-gray-300">
                      {request.whatsapp ? (
                        <a
                          href={`https://wa.me/${request.whatsapp.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#d4af37] hover:text-[#b8941f] transition-colors duration-200"
                        >
                          {request.whatsapp}
                        </a>
                      ) : (
                        'N/A'
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Origin Country</p>
                    <p className="text-gray-300">{request.origin_country || 'N/A'}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Travel Information */}
            <div className="pt-6 border-t border-[#333]">
              <h2 className="text-2xl font-semibold text-[#d4af37] mb-4">Travel Information</h2>
              {editingClientInfo ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={startDateValue}
                        onChange={(e) => setStartDateValue(e.target.value)}
                        className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all [color-scheme:dark]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={endDateValue}
                        onChange={(e) => setEndDateValue(e.target.value)}
                        min={startDateValue || undefined}
                        className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all [color-scheme:dark]"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Duration</p>
                      <p className="text-gray-300 py-3">
                        {startDateValue && endDateValue
                          ? (() => {
                              const start = new Date(startDateValue)
                              const end = new Date(endDateValue)
                              if (end >= start) {
                                const diffTime = Math.abs(end.getTime() - start.getTime())
                                // Add 1 to make duration inclusive of both start and end dates
                                // e.g., June 2-4 = 3 days (June 2, 3, 4)
                                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1
                                return `${diffDays} days`
                              }
                              return 'Invalid'
                            })()
                          : request.duration
                          ? `${request.duration} days`
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                        Number of Adults
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={numberOfAdultsValue}
                        onChange={(e) => setNumberOfAdultsValue(e.target.value)}
                        className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                        Number of Children
                      </label>
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
                        className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                  {parseInt(numberOfChildrenValue) > 0 && (
                    <div>
                      <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                        {parseInt(numberOfChildrenValue) === 1 ? 'Child Age (years)' : 'Children Ages (years)'}
                      </label>
                      <div className={`grid gap-3 ${parseInt(numberOfChildrenValue) <= 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                        {childrenAgesValue.map((age, index) => (
                          <div key={index}>
                            <label className="block text-xs text-gray-400 mb-1">
                              Child {index + 1} Age
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
                              className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Start Date</p>
                      <p className="text-gray-300">{formatDate(request.start_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">End Date</p>
                      <p className="text-gray-300">{formatDate(request.end_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Duration</p>
                      <p className="text-gray-300">{request.duration ? `${request.duration} days` : 'N/A'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Number of Adults</p>
                      <p className="text-gray-300">{request.number_of_adults || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Number of Children</p>
                      <p className="text-gray-300">{request.number_of_children || 'N/A'}</p>
                    </div>
                    {request.children_ages && (() => {
                      try {
                        const ages = JSON.parse(request.children_ages)
                        if (Array.isArray(ages) && ages.length > 0) {
                          return (
                            <div className="md:col-span-2">
                              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Children Ages</p>
                              <p className="text-gray-300">
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

            {/* Additional Preferences */}
            <div className="pt-6 border-t border-[#333]">
              <h2 className="text-2xl font-semibold text-[#d4af37] mb-4">Additional Preferences</h2>
              {editingClientInfo ? (
                <textarea
                  value={additionalPreferencesValue}
                  onChange={(e) => setAdditionalPreferencesValue(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent transition-all resize-y"
                  placeholder="e.g., honeymoon, wildlife safari, luxury focus, train journeys, ayurveda retreat, family friendly, adventure"
                />
              ) : (
                <div className="bg-[#0a0a0a] border border-[#333] rounded-md p-4">
                  <p className="text-gray-300 whitespace-pre-wrap">
                    {request.additional_preferences || 'No preferences specified'}
                  </p>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="pt-6 border-t border-[#333]">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-[#d4af37]">Notes</h2>
              </div>
              {editingNotes ? (
                <div className="space-y-3">
                  <textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    className="w-full h-32 bg-[#0a0a0a] border border-[#333] rounded-md p-4 text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#d4af37] resize-y"
                    placeholder="Add internal notes..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveNotes}
                      disabled={saving}
                      className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setNotesValue(request.notes || '')
                        setEditingNotes(false)
                      }}
                      className="px-4 py-2 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0a0a0a] border border-[#333] rounded-md p-4">
                  {request.notes ? (
                    <p className="text-gray-300 whitespace-pre-wrap">{request.notes}</p>
                  ) : (
                    <p className="text-gray-500 italic">No notes added yet.</p>
                  )}
                  <button
                    onClick={() => setEditingNotes(true)}
                    className="mt-3 text-sm text-[#d4af37] hover:text-[#b8941f] transition-colors"
                  >
                    {request.notes ? 'Edit Notes' : 'Add Notes'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Success Message */}
        {sendSuccess && (
          <div className="mb-6 bg-green-900/20 border-2 border-green-500 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <svg
                className="w-6 h-6 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <p className="text-green-400 font-semibold">Itinerary sent successfully!</p>
            </div>
          </div>
        )}

        {/* Itinerary Options Section */}
        <div className="bg-[#1a1a1a]/50 backdrop-blur-sm border border-[#333] rounded-xl p-4 md:p-6">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <h2 className="text-2xl font-semibold text-[#d4af37]">Itinerary Options</h2>
            {!isCancelled && (
              <div className="flex gap-2 flex-wrap">
                {[0, 1, 2].map((optionIndex) => {
                  const optionExists = itineraryOptions[optionIndex] !== null && itineraryOptions[optionIndex] !== undefined
                  const isGenerating = generatingOption === optionIndex
                  return (
                    <button
                      key={optionIndex}
                      onClick={() => handleGenerateSingleOption(optionIndex)}
                      disabled={isGenerating || generatingItinerary}
                      className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
              <p className="text-sm text-gray-500 italic">Itinerary generation disabled for cancelled trips</p>
            )}
            {request.selected_option !== null && request.selected_option !== undefined && request.public_token ? (() => {
              // Check if this is a resend (same option) or new send (different option or first time)
              // It's a resend only if: sent_at exists AND last_sent_option matches selected_option
              const isResend = request.sent_at && 
                               request.last_sent_option !== null && 
                               request.last_sent_option !== undefined &&
                               request.selected_option === request.last_sent_option
              
              return (
                <div className="flex gap-2 flex-wrap items-center">
                  <button
                    onClick={handleSendItinerary}
                    disabled={sendingItinerary}
                    className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {sendingItinerary ? (
                      <>
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-black"></div>
                        Sending...
                      </>
                    ) : isResend ? (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Resend Itinerary
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Send Itinerary to Client
                      </>
                    )}
                  </button>
                  {request.sent_at && request.last_sent_at && (
                    <div className="flex items-center text-xs text-gray-400 px-2">
                      Last sent: {formatDateTime(request.last_sent_at)}
                    </div>
                  )}
                  {request.whatsapp && (
                    <button
                      onClick={handleWhatsAppShare}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors duration-200 flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                      WhatsApp
                    </button>
                  )}
                </div>
              )
            })() : null}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[0, 1, 2].map((index) => {
              const option = itineraryOptions[index]
              const optionExists = option !== null && option !== undefined
              const isGenerating = generatingOption === index
              const isSelected = request.selected_option === index
              
              if (!optionExists && !isGenerating) {
                // Placeholder for option not yet generated
                return (
                  <div
                    key={index}
                    className="bg-[#0a0a0a] border border-[#333] rounded-lg p-6 flex flex-col items-center justify-center min-h-[300px]"
                  >
                    <div className="text-center">
                      <div className="w-16 h-16 bg-[#333] rounded-full flex items-center justify-center mb-4 mx-auto">
                        <span className="text-2xl text-gray-500">{index + 1}</span>
                      </div>
                      <p className="text-gray-500 mb-4">Option {index + 1} not generated yet</p>
                      <button
                        onClick={() => handleGenerateSingleOption(index)}
                        disabled={generatingOption !== null || generatingItinerary || isCancelled}
                        className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Generate Option {index + 1}
                      </button>
                    </div>
                  </div>
                )
              }
              
              if (isGenerating) {
                // Loading state for option being generated
                return (
                  <div
                    key={index}
                    className="bg-[#0a0a0a] border border-[#333] rounded-lg p-6 flex flex-col items-center justify-center min-h-[300px]"
                  >
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#d4af37] mb-4"></div>
                    <p className="text-gray-400">Generating Option {index + 1}...</p>
                  </div>
                )
              }
              
              // Display generated option (option is guaranteed to exist at this point)
              if (!option) {
                return null // Safety check
              }
              
              return (
                <div
                  key={index}
                  className={`bg-[#0a0a0a] border rounded-lg p-6 flex flex-col ${
                    isSelected
                      ? 'border-[#d4af37] ring-2 ring-[#d4af37]'
                      : 'border-[#333]'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-xl font-semibold text-[#d4af37] flex-1">
                      {option.title}
                    </h3>
                    {isSelected && (
                      <span className="ml-2 px-2 py-1 bg-[#d4af37] text-black text-xs font-semibold rounded">
                        SELECTED
                      </span>
                    )}
                  </div>
                  <div className="mb-4 flex-1">
                    <p className="text-sm text-gray-400 mb-3">{option.summary}</p>
                    <div className="bg-[#1a1a1a] border border-[#333] rounded-md p-4 max-h-64 overflow-y-auto">
                      <p className="text-gray-300 text-sm whitespace-pre-wrap font-mono">
                        {Array.isArray(option.days) 
                          ? option.days.map((day: any) => 
                              `Day ${day.day}: ${day.title} - ${day.location}\n${day.activities?.map((act: string) => `  • ${act}`).join('\n') || ''}`
                            ).join('\n\n')
                          : (typeof option.days === 'string' ? option.days : '')
                        }
                      </p>
                    </div>
                    {/* Total Kilometers - Admin Only */}
                    {typeof option.total_kilometers === 'number' && (
                      <div className="mt-3 bg-[#1a1a1a] border border-[#333] rounded-md p-3">
                        <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
                          Total Kilometers
                        </label>
                        <p className="text-[#d4af37] text-lg font-semibold">
                          {option.total_kilometers.toLocaleString()} km
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSelectOption(index)}
                      disabled={selectingOption !== null}
                      className={`flex-1 py-2 px-4 rounded-md font-semibold transition-colors duration-200 ${
                        isSelected
                          ? 'bg-[#666] hover:bg-[#777] text-white'
                          : 'bg-[#d4af37] hover:bg-[#b8941f] text-black'
                      } disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                    >
                      {selectingOption === index ? (
                        <>
                          <div className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-current"></div>
                          {isSelected ? 'Deselecting...' : 'Selecting...'}
                        </>
                      ) : isSelected ? (
                        'Deselect Option'
                      ) : (
                        'Select This Option'
                      )}
                    </button>
                    <button
                      onClick={() => handleGenerateSingleOption(index)}
                      disabled={generatingOption !== null || generatingItinerary || isCancelled}
                      className="px-3 py-2 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Regenerate this option"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sent Itinerary Section - Show if any options have been sent */}
        {(() => {
          const hasSentAt = !!request.sent_at
          const hasOptions = !!request.itinerary_options?.options
          const hasSentOptions = request.sent_options && Array.isArray(request.sent_options) && request.sent_options.length > 0
          const shouldShow = hasSentAt && hasOptions && (hasSentOptions || request.last_sent_option !== null)
          
          if (!shouldShow) return null
          
          return (
            <div className="bg-[#1a1a1a]/50 backdrop-blur-sm border border-[#333] rounded-xl p-4 md:p-6 mt-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-semibold text-[#d4af37]">Sent Itinerary</h2>
                  {request.sent_at && (
                    <p className="text-sm text-gray-400 mt-1">
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
              </div>

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
                <div className="mb-6 mt-6 pt-6 border-t border-[#333]">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-[#d4af37]">All Sent Options ({sentOptionsList.length})</h3>
                    {showLimitNote && (
                      <span className="text-xs text-gray-500">Showing most recent 10</span>
                    )}
                  </div>
                  <div className="space-y-6">
                    {sentOptionsList.map((sentOption: any, index: number) => {
                      // Ensure option_index is a valid number
                      const optionIndex = typeof sentOption.option_index === 'number' ? sentOption.option_index : null
                      if (optionIndex === null || optionIndex === undefined) {
                        return null
                      }

                      const option = request.itinerary_options?.options?.[optionIndex]
                      // Safely get option title - ensure it's a string
                      let optionTitle = `Option ${optionIndex + 1}`
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
                      } else if (request.public_token && typeof request.public_token === 'string') {
                        // Fallback: generate URL if not stored
                        const baseUrl = "https://admin.lankalux.com"
                        itineraryUrl = `${baseUrl}/itinerary/${request.public_token}/${optionIndex}`
                      }

                      return (
                        <div 
                          key={`sent-option-${index}-${optionIndex}`} 
                          className="bg-[#0a0a0a] border border-[#333] rounded-lg p-6 hover:border-[#d4af37]/50 transition-colors"
                        >
                          <div className="space-y-4">
                            {/* Header with title and sent date */}
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h4 className="text-xl font-semibold text-[#d4af37]">{String(optionTitle)}</h4>
                                  {sentAt && (
                                    <span className="text-xs text-gray-500">
                                      Sent: {formatDateTime(sentAt)}
                                    </span>
                                  )}
                                </div>
                                {optionSummary && (
                                  <p className="text-gray-300 text-sm mt-2">{optionSummary}</p>
                                )}
                              </div>
                            </div>

                            {/* Days/Details */}
                            {optionDays && (
                              <div>
                                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                                  Day-by-Day Itinerary
                                </label>
                                <div className="bg-[#1a1a1a] border border-[#333] rounded-md p-4 max-h-64 overflow-y-auto">
                                  <p className="text-gray-300 text-sm whitespace-pre-wrap font-mono">
                                    {optionDays}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Total Kilometers - Admin Only */}
                            {option && typeof option.total_kilometers === 'number' && (
                              <div className="pt-4 border-t border-[#333]">
                                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                                  Total Kilometers
                                </label>
                                <div className="bg-[#1a1a1a] border border-[#333] rounded-md p-3">
                                  <p className="text-[#d4af37] text-lg font-semibold">
                                    {option.total_kilometers.toLocaleString()} km
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Public Link */}
                            {itineraryUrl && (
                              <div className="pt-4 border-t border-[#333]">
                                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-2">
                                  Public Itinerary Link
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    readOnly
                                    value={itineraryUrl}
                                    className="flex-1 px-4 py-2 bg-[#1a1a1a] border border-[#333] rounded-md text-gray-300 text-sm font-mono"
                                  />
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(itineraryUrl)
                                      alert('Link copied to clipboard!')
                                    }}
                                    className="px-4 py-2 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md transition-colors duration-200 flex items-center gap-2"
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
                                    className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 flex items-center gap-2"
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
          )
        })()}

      {/* Follow-up email: dedicated section, separate from itinerary, expanded */}
      {request.email && (
        <div className="bg-[#1a1a1a]/50 backdrop-blur-sm border border-[#333] rounded-xl p-6 md:p-8 mt-10">
          <h2 className="text-2xl font-semibold text-[#d4af37] mb-2">Follow-up email</h2>
          <p className="text-gray-400 mb-6 max-w-xl">
            Send a friendly, humanized email to the client. Choose a template, preview and edit in the popup, then send. The client will see a button linking to their itinerary when available.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[260px]">
              <label className="block text-sm font-medium text-gray-400 mb-2">Template</label>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value as TemplateId)}
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent"
              >
                {FOLLOW_UP_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={openTemplateEmailModal}
              className="px-5 py-3 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-lg transition-colors duration-200 flex items-center gap-2"
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
            <div className="mt-10 pt-8 border-t border-[#333]">
              <h3 className="text-lg font-semibold text-gray-300 mb-4">Follow-up emails sent</h3>
              <ul className="space-y-3">
                {[...request.follow_up_emails_sent]
                  .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
                  .map((entry, index) => (
                    <li
                      key={`${entry.sent_at}-${index}`}
                      className="flex flex-wrap items-baseline gap-3 py-2 text-gray-300"
                    >
                      <time className="text-sm text-gray-500 shrink-0" dateTime={entry.sent_at}>
                        {formatDateTime(entry.sent_at)}
                      </time>
                      <span className="text-gray-600">·</span>
                      <span className="text-gray-300" title={entry.subject}>
                        {entry.template_name}: {entry.subject}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Follow-up email preview modal: edit subject/body then send */}
      {templateEmailModalOpen && request?.email && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={() => !sendingTemplateEmail && setTemplateEmailModalOpen(false)}
        >
          <div
            className="bg-[#1a1a1a] border border-[#333] rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-[#333]">
              <h2 className="text-xl font-semibold text-[#d4af37]">Preview email</h2>
              <p className="text-sm text-gray-400 mt-1">Edit the subject and message below, then send.</p>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">To</label>
                <p className="text-white font-medium">{request.email}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Subject</label>
                <input
                  type="text"
                  value={previewSubject}
                  onChange={(e) => setPreviewSubject(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent"
                  placeholder="Email subject"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Message</label>
                <p className="text-xs text-gray-500 mb-1">A “View your itinerary” button and our signature will be added automatically.</p>
                <textarea
                  value={previewBody}
                  onChange={(e) => setPreviewBody(e.target.value)}
                  rows={12}
                  className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] focus:border-transparent resize-y font-mono text-sm"
                  placeholder="Email body (plain text)"
                />
              </div>
            </div>
            <div className="p-6 border-t border-[#333] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => !sendingTemplateEmail && setTemplateEmailModalOpen(false)}
                disabled={sendingTemplateEmail}
                className="px-4 py-2 bg-[#333] hover:bg-[#444] text-white font-semibold rounded-md transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendTemplateEmail}
                disabled={sendingTemplateEmail}
                className="px-4 py-2 bg-[#d4af37] hover:bg-[#b8941f] text-black font-semibold rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
      </div>
    </div>
  )
}
