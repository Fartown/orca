/** A share page has no app to route links through; a new-tab anchor lets the browser open them. */
export function openAppHttpLink(url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.click()
}
