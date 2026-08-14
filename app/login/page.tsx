import { redirect } from 'next/navigation'

/** Legacy login now opens the branded console login. /dashboard remains as rollback. */
export default function LoginPage() {
  redirect('/console/login')
}
