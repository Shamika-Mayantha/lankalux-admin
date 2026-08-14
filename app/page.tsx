import { redirect } from 'next/navigation'

/** Preview/home opens the new console, not the legacy /dashboard. */
export default function Home() {
  redirect('/console')
}
