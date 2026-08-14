import { jsonErr, jsonOk, requireAdmin } from '@/app/api/v2/_guard'
import { envFlags } from '@/config/env'
import { getServiceClient } from '@/services/supabase.server'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const flags = envFlags()
    let supabaseOk = flags.SUPABASE_SERVICE_ROLE_KEY === 'configured'
    try {
      const sb = getServiceClient()
      const { error } = await sb.from('Client Requests').select('id').limit(1)
      supabaseOk = !error
    } catch {
      supabaseOk = false
    }
    return jsonOk({
      flags,
      supabase: supabaseOk ? 'configured' : 'error',
      openai: flags.OPENAI_API_KEY,
      smtp: flags.SMTP_HOST === 'configured' && flags.SMTP_USER === 'configured' && flags.SMTP_PASS === 'configured' ? 'configured' : 'missing',
      whatsapp: 'click-to-chat',
    })
  } catch (err) {
    return jsonErr(err)
  }
}
