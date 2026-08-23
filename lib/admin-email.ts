export const ADMIN_LOGIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'hello@lankalux.com').trim().toLowerCase()

export function isLankaLuxAdminEmail(email: string | null | undefined) {
  return (email ?? '').trim().toLowerCase() === ADMIN_LOGIN_EMAIL
}
