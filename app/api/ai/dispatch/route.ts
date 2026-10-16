import { NextResponse } from 'next/server'
import { checkDispatchToken, dispatchAll } from '@/services/ai-dispatch.service'

export const maxDuration = 300

/**
 * Called by the database (pg_net, 20261016210000_ai_dispatch.sql) when AI work becomes
 * runnable. The token lives in Supabase Vault and is checked there; every action inside
 * still passes the ai_begin_action() gate, so a caller can only make approved work run sooner.
 */
export async function POST(request: Request) {
  if (!(await checkDispatchToken(request.headers.get('x-ai-dispatch-token')))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ success: true, ...(await dispatchAll()) })
  } catch (err) {
    console.error('[ai/dispatch]', err)
    return NextResponse.json({ success: false, error: 'Dispatch failed.' }, { status: 500 })
  }
}
