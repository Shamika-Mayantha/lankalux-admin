'use client'

import { useEffect } from 'react'

/** Keeps console/journey pages off the old CRM zoom + dark-theme chrome. */
export function BrandDocument() {
  useEffect(() => {
    const html = document.documentElement
    html.setAttribute('data-ll-brand', '1')
    html.setAttribute('data-theme', 'light')
    return () => {
      html.removeAttribute('data-ll-brand')
    }
  }, [])
  return null
}
