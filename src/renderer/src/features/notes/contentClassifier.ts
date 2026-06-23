export type ContentType =
  | 'code'
  | 'command'
  | 'json'
  | 'yaml'
  | 'xml'
  | 'sql'
  | 'url'
  | 'stack'
  | 'log'
  | 'error'
  | 'image'
  | 'task'
  | 'callout'
  | 'markdown'
  | 'table'
  | 'text'

export interface ContentBlock {
  id: string
  type: ContentType
  icon: string
  label: string
  language?: string
  previewText: string
  fullText: string
}

const typeMeta: Record<ContentType, { icon: string; label: string }> = {
  code: { icon: '🐍', label: 'Source code' },
  command: { icon: '💻', label: 'Terminal command' },
  json: { icon: '🗄️', label: 'JSON' },
  yaml: { icon: '📄', label: 'YAML' },
  xml: { icon: '📦', label: 'XML' },
  sql: { icon: '🗄', label: 'SQL' },
  url: { icon: '🔗', label: 'URL' },
  stack: { icon: '⚠️', label: 'Stack trace' },
  log: { icon: '📋', label: 'Log' },
  error: { icon: '🔥', label: 'Error' },
  image: { icon: '🖼️', label: 'Image' },
  task: { icon: '☑', label: 'Task' },
  callout: { icon: '💬', label: 'Callout' },
  markdown: { icon: '📝', label: 'Markdown' },
  table: { icon: '📊', label: 'Table' },
  text: { icon: '📄', label: 'Text' }
}

function createBlock(type: ContentType, text: string, language?: string): ContentBlock {
  const trimmed = text.trim()
  return {
    id: `block-${Math.random().toString(36).slice(2, 11)}`,
    type,
    icon: typeMeta[type].icon,
    label: language ? `${typeMeta[type].label} • ${language}` : typeMeta[type].label,
    language,
    previewText: trimmed.length > 140 ? `${trimmed.slice(0, 140)}…` : trimmed,
    fullText: trimmed
  }
}

function cleanText(text: string): string {
  return text.replace(/\r\n/g, '\n').trim()
}

function isJson(text: string): boolean {
  const cleaned = cleanText(text)
  if (!cleaned) return false
  try {
    JSON.parse(cleaned)
    return true
  } catch {
    return false
  }
}

function isXml(text: string): boolean {
  const cleaned = cleanText(text)
  return /^<\?xml|^<[^>]+>/.test(cleaned) && /<\/?[a-zA-Z]/.test(cleaned)
}

function isYaml(text: string): boolean {
  const lines = cleanText(text).split('\n').map((line) => line.trim())
  if (lines.length < 2) {
    return false
  }

  const hasKeyValues = lines.filter((line) => /^[\w\-]+\s*:\s*/.test(line)).length
  const hasBraces = /[{}]/.test(text)
  return hasKeyValues >= Math.max(1, Math.floor(lines.length / 3)) && !hasBraces
}

function isSql(text: string): boolean {
  const cleaned = cleanText(text).toLowerCase()
  return /\b(select|insert|update|delete|create|alter|drop|with|from)\b/.test(cleaned) && /\bfrom\b|\bwhere\b|\bjoin\b/.test(cleaned)
}

function isUrl(text: string): boolean {
  const trimmed = cleanText(text)
  return /^https?:\/\//i.test(trimmed) || /^ftp:\/\//i.test(trimmed) || /^www\./i.test(trimmed)
}

function isStackTrace(text: string): boolean {
  const lines = cleanText(text).split('\n').slice(0, 12)
  const traceLines = lines.filter((line) => /\bat\s+.*\(|\bException\b|\bError\b|\bCaused by\b|\btraceback\b/i.test(line))
  return traceLines.length >= Math.max(2, Math.floor(lines.length / 4))
}

function isErrorText(text: string): boolean {
  const cleaned = cleanText(text)
  if (!cleaned) {
    return false
  }

  if (isLog(text) || isStackTrace(text)) {
    return false
  }

  return /\b(error|exception|failed|fatal|panic|cannot|undefined|null|traceback)\b/i.test(cleaned)
}

function isLog(text: string): boolean {
  const lines = cleanText(text).split('\n')
  const logLine = lines.filter((line) => /^(\[?\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}|DEBUG|INFO|WARN|ERROR|TRACE)\b/.test(line.trim()))
  return logLine.length >= Math.max(1, Math.floor(lines.length / 3))
}

function isTable(text: string): boolean {
  const lines = cleanText(text).split('\n').map((line) => line.trim())
  if (lines.length < 2) {
    return false
  }

  const separator = lines[1]
  return /^\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?$/.test(separator)
}

function isMarkdown(text: string): boolean {
  const trimmed = cleanText(text)
  if (!trimmed) return false
  return /(^#{1,6}\s)|(^[-*+]\s)|(^>\s)|(```)|\[[^\]]+\]\([^\)]+\)/m.test(trimmed)
}

function isTerminalCommand(text: string): boolean {
  const lines = cleanText(text).split('\n').map((line) => line.trim())
  if (lines.length === 0) {
    return false
  }

  const commands = ['curl', 'kubectl', 'docker', 'git', 'npm', 'pnpm', 'yarn', 'go', 'cargo', 'powershell', 'pwsh', 'bash', 'sh', 'ls', 'cd', 'cat', 'echo', 'scp', 'ssh']
  const firstLine = lines[0].replace(/^\$\s*/, '')
  return commands.some((command) => firstLine.startsWith(command)) || lines.every((line) => /^\$?\s*[\w\-._\/\\]+\s/.test(line) || /^[\w\-._\/\\]+$/.test(line))
}

function detectSourceLanguage(text: string): string | undefined {
  const cleaned = cleanText(text)
  const codeHints = [
    { pattern: /(^|\n)\s*def\s+\w+\s*\(/, language: 'python' },
    { pattern: /(^|\n)\s*import\s+\w+/, language: 'python' },
    { pattern: /(^|\n)\s*func\s+\w+\(/, language: 'go' },
    { pattern: /(^|\n)\s*package\s+\w+/, language: 'go' },
    { pattern: /(^|\n)\s*fmt\./, language: 'go' },
    { pattern: /(^|\n)\s*(const|let|var)\s+\w+\s*=?/, language: 'typescript' },
    { pattern: /(^|\n)\s*console\.log\(/, language: 'javascript' },
    { pattern: /(^|\n)\s*class\s+\w+/, language: 'java' },
    { pattern: /(^|\n)\s*public\s+(class|static|void|int)/, language: 'java' },
    { pattern: /(^|\n)\s*#include\s+<.*>/, language: 'cpp' },
    { pattern: /(^|\n)\s*using\s+namespace\s+std/, language: 'cpp' },
    { pattern: /(^|\n)\s*fn\s+\w+\(/, language: 'rust' },
    { pattern: /(^|\n)\s*let\s+mut\s+\w+/, language: 'rust' },
    { pattern: /(^|\n)\s*Write-Host\s+/, language: 'powershell' },
    { pattern: /(^|\n)\s*docker\s+build|^FROM\s+/, language: 'dockerfile' },
    { pattern: /(^|\n)\s*SELECT\s+/i, language: 'sql' }
  ]

  for (const hint of codeHints) {
    if (hint.pattern.test(cleaned)) {
      return hint.language
    }
  }

  if (/\bfunction\b/.test(cleaned) && /\{/.test(cleaned)) {
    return 'javascript'
  }

  return undefined
}

function detectContentType(text: string): { type: ContentType; language?: string } {
  if (isJson(text)) {
    return { type: 'json', language: 'json' }
  }

  if (isXml(text)) {
    return { type: 'xml', language: 'xml' }
  }

  if (isYaml(text)) {
    return { type: 'yaml', language: 'yaml' }
  }

  if (isTable(text)) {
    return { type: 'table' }
  }

  if (isErrorText(text)) {
    return { type: 'error', language: 'text' }
  }

  if (isSql(text)) {
    return { type: 'sql', language: 'sql' }
  }

  if (isStackTrace(text)) {
    return { type: 'stack', language: 'text' }
  }

  if (isLog(text)) {
    return { type: 'log', language: 'text' }
  }

  if (isTerminalCommand(text)) {
    const language = detectSourceLanguage(text) ?? 'terminal'
    return { type: 'command', language }
  }

  if (isUrl(text)) {
    return { type: 'url' }
  }

  if (isMarkdown(text)) {
    return { type: 'markdown' }
  }

  const codeLanguage = detectSourceLanguage(text)
  if (codeLanguage || /\bfunction\b|\bclass\b|\bconst\b|\bvar\b|\bimport\b|\bpackage\b/.test(text)) {
    return { type: 'code', language: codeLanguage ?? 'text' }
  }

  return { type: 'text' }
}

export function classifyPasteText(text: string): ContentBlock {
  const normalized = cleanText(text)
  const classification = detectContentType(normalized)
  return createBlock(classification.type, normalized, classification.language)
}

function normalizeBlockText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function getLanguageFromNode(codeElement: HTMLElement): string | undefined {
  const dataLanguage = codeElement.getAttribute('data-language')
  if (dataLanguage) {
    return dataLanguage
  }

  const className = codeElement.className || ''
  const match = className.match(/language-(\w+)/)
  return match ? match[1] : undefined
}

export function buildSmartExplorerBlocks(html: string): ContentBlock[] {
  const parser = new DOMParser()
  const document = parser.parseFromString(html, 'text/html')
  const blocks: ContentBlock[] = []

  const calloutNodes = Array.from(document.querySelectorAll('div[data-type="callout-block"]'))
  for (const callout of calloutNodes) {
    blocks.push(createBlock('callout', callout.textContent ?? '', 'callout'))
  }

  const imageNodes = Array.from(document.querySelectorAll('img'))
  for (const image of imageNodes) {
    blocks.push(createBlock('image', image.alt || image.src || 'Image', 'image'))
  }

  const taskNodes = Array.from(document.querySelectorAll('input[type="checkbox"]'))
  for (const task of taskNodes) {
    const labelText = task.closest('label')?.textContent?.trim() || task.getAttribute('aria-label') || 'Task'
    blocks.push(createBlock('task', labelText, 'task'))
  }

  const preNodes = Array.from(document.querySelectorAll('pre'))
  for (const pre of preNodes) {
    const text = pre.textContent ?? ''
    const classification = detectContentType(text)
    const language = getLanguageFromNode(pre.querySelector('code') as HTMLElement) ?? classification.language
    blocks.push(createBlock(classification.type, text, language))
  }

  const tableNodes = Array.from(document.querySelectorAll('table'))
  for (const table of tableNodes) {
    blocks.push(createBlock('table', table.textContent ?? '', 'table'))
  }

  const linkNodes = Array.from(document.querySelectorAll('a[href]'))
  for (const link of linkNodes) {
    blocks.push(createBlock('url', link.textContent ?? link.getAttribute('href') ?? '', 'url'))
  }

  const blockquoteNodes = Array.from(document.querySelectorAll('blockquote'))
  for (const quote of blockquoteNodes) {
    blocks.push(createBlock('markdown', quote.textContent ?? '', 'quote'))
  }

  const paragraphs = Array.from(document.querySelectorAll('p'))
    .map((paragraph) => paragraph.textContent?.trim() ?? '')
    .filter((text) => text.length > 24)

  for (const paragraph of paragraphs) {
    const type = detectContentType(paragraph)
    if (type.type !== 'text') {
      blocks.push(createBlock(type.type, paragraph, type.language))
    }
  }

  if (blocks.length === 0 && html.trim().length > 0) {
    blocks.push(createBlock('text', document.body.textContent ?? '', 'text'))
  }

  return blocks
}
