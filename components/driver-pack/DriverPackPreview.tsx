'use client'

import { useEffect, useMemo, useState } from 'react'

export function DriverPackPreview({ blob, title }: { blob: Blob | null; title: string }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])
  if (!blob || !url) {
    return <p className="ll-muted">Generate a preview to review this document.</p>
  }
  return <iframe className="ll-driver-preview" title={title} src={`${url}#view=FitH`} />
}
