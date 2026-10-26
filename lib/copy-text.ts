/**
 * Copies text, falling back when the async Clipboard API refuses (it throws "Document is not
 * focused" when the click's focus was lost during an await, or inside some embedded browsers).
 * Returns false when nothing worked, so the caller can show the text for a manual copy.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    window.focus()
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fall through to the selection-based copy.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}
