// Copies the LankaLux Instagram account's recent posts, reels and their numbers into
// instagram_account / instagram_media, so the weekly reels planner can see what worked.
//
// Read only: the token carries instagram_business_basic and instagram_business_manage_insights,
// and this function only makes GET calls. It never posts, comments or changes anything on
// Instagram. Called once a day by pg_cron (x-instagram-sync-token header, checked against
// Vault) or by hand with the service key. Deploy with verify_jwt = false.
//
// Secret (Supabase dashboard, never in code or chat): IG_ACCESS_TOKEN, a long-lived Instagram
// user token from the Meta app dashboard. The refreshed copy lives in instagram_token.
// Nothing here logs a token.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const GRAPH = 'https://graph.instagram.com/v26.0'
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const db = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY, { auth: { persistSession: false } })

const MAX_MEDIA = 100
const REFRESH_AFTER_DAYS = 7
const REEL_METRICS = 'views,reach,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time'
const FEED_METRICS = 'views,reach,likes,comments,saved,shares,total_interactions,profile_visits,follows'
const BASIC_METRICS = 'reach,likes,comments,saved,shares'

async function authorised(req: Request) {
  const syncToken = req.headers.get('x-instagram-sync-token') ?? ''
  if (syncToken) {
    const { data } = await db.rpc('instagram_check_sync_token', { p_token: syncToken })
    if (data === true) return true
  }
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  return Boolean(bearer) && bearer === SERVICE_KEY
}

// Graph errors can echo the request URL, which holds the token; keep only Meta's message.
async function get(path: string, params: Record<string, string>, token: string) {
  const url = new URL(path.startsWith('http') ? path : `${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', token)
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(String(body?.error?.message ?? `Instagram API ${res.status}`))
  return body
}

async function currentToken(): Promise<string> {
  const { data } = await db.from('instagram_token').select('access_token, refreshed_at').maybeSingle()
  let token = data?.access_token ?? (Deno.env.get('IG_ACCESS_TOKEN') ?? '').trim()
  if (!token) throw new Error('IG_ACCESS_TOKEN is not set')

  // Long-lived tokens last 60 days and can be refreshed once they are a day old.
  const age = data ? (Date.now() - new Date(data.refreshed_at).getTime()) / 86_400_000 : Infinity
  if (age > REFRESH_AFTER_DAYS) {
    try {
      const r = await get('https://graph.instagram.com/refresh_access_token', { grant_type: 'ig_refresh_token' }, token)
      if (r.access_token) {
        token = r.access_token
        await db.from('instagram_token').upsert({
          id: true,
          access_token: token,
          refreshed_at: new Date().toISOString(),
          expires_at: r.expires_in ? new Date(Date.now() + r.expires_in * 1000).toISOString() : null,
        })
      }
    } catch (e) {
      console.warn('instagram-sync: token refresh skipped:', (e as Error).message)
    }
  }
  return token
}

async function insightsFor(m: { id: string; media_product_type?: string }, token: string) {
  // One unsupported metric fails the whole call, so fall back to a basic set before giving up.
  const tries = [m.media_product_type === 'REELS' ? REEL_METRICS : FEED_METRICS, BASIC_METRICS]
  let lastError = ''
  for (const metrics of tries) {
    try {
      const r = await get(`${m.id}/insights`, { metric: metrics }, token)
      const out: Record<string, number> = {}
      for (const row of r.data ?? []) out[row.name] = row.values?.[0]?.value ?? row.total_value?.value ?? null
      return out
    } catch (e) {
      lastError = (e as Error).message
    }
  }
  // Some media (old posts, stories, ads) refuse insights; keep the post without them.
  return { error: lastError }
}

Deno.serve(async (req: Request) => {
  if (!(await authorised(req))) return new Response('Unauthorised', { status: 401 })
  try {
    const token = await currentToken()
    const me = await get('me', { fields: 'user_id,username,followers_count,media_count' }, token)
    await db.from('instagram_account').upsert({
      ig_user_id: String(me.user_id ?? me.id),
      username: me.username,
      followers_count: me.followers_count ?? null,
      media_count: me.media_count ?? null,
      synced_at: new Date().toISOString(),
    })

    const media: any[] = []
    let page = await get('me/media', {
      fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count',
      limit: '50',
    }, token)
    while (true) {
      media.push(...(page.data ?? []))
      if (media.length >= MAX_MEDIA || !page.paging?.next) break
      page = await get(page.paging.next, {}, token)
    }

    const rows: Record<string, unknown>[] = []
    for (const m of media.slice(0, MAX_MEDIA)) {
      rows.push({
        id: m.id,
        posted_at: m.timestamp,
        media_type: m.media_type,
        media_product_type: m.media_product_type,
        caption: m.caption ?? null,
        permalink: m.permalink,
        thumbnail_url: m.thumbnail_url ?? (m.media_type === 'IMAGE' ? m.media_url : null),
        like_count: m.like_count ?? null,
        comments_count: m.comments_count ?? null,
        insights: await insightsFor(m, token),
        synced_at: new Date().toISOString(),
      })
    }
    const { error } = await db.from('instagram_media').upsert(rows)
    if (error) throw new Error(error.message)

    return Response.json({ ok: true, username: me.username, media: rows.length })
  } catch (e) {
    console.error('instagram-sync failed:', (e as Error).message)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
})
