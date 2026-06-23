import type { Highlighter } from 'shiki'

let highlighterPromise: Promise<Highlighter> | null = null

function normalizeShikiLanguage(language?: string): string {
  const normalized = String(language ?? 'plaintext').trim().toLowerCase()
  if (normalized === 'text' || normalized === 'plain' || normalized === 'plaintext') {
    return 'plaintext'
  }

  if (normalized === 'powershell' || normalized === 'pwsh') {
    return 'powershell'
  }

  if (normalized === 'shell' || normalized === 'bash' || normalized === 'sh') {
    return 'bash'
  }

  if (normalized === 'docker') {
    return 'dockerfile'
  }

  return normalized
}

export async function getShikiHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then((shiki) =>
      shiki.createHighlighter({
        themes: ['dark-plus'],
        langs: ['plaintext']
      })
    )
  }

  return highlighterPromise
}

export async function renderShikiCodeHtml(code: string, language?: string): Promise<string> {
  const highlighter = await getShikiHighlighter()
  return highlighter.codeToHtml(code, {
    lang: normalizeShikiLanguage(language),
    theme: 'dark-plus'
  })
}
