import { redirect } from 'next/navigation'

export default function LegacyInvoicesRedirect() {
  redirect('/console/invoices')
}
