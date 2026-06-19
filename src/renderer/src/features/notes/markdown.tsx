import type { JSX, ReactNode } from 'react'

type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'image'; alt: string; url: string }
  | { type: 'code'; text: string }

const urlPattern = /^(https?:\/\/|mailto:)/i

function openExternalUrl(url: string) {
  if (window.runtime?.BrowserOpenURL) {
    window.runtime.BrowserOpenURL(url)
  }
}

function safeUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!urlPattern.test(trimmed)) {
    return null
  }
  return trimmed
}

function parseBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []

  let paragraph: string[] = []
  let listItems: string[] = []
  let listOrdered = false
  let quoteLines: string[] = []
  let codeLines: string[] = []
  let inCode = false

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() })
      paragraph = []
    }
  }

  function flushList() {
    if (listItems.length > 0) {
      blocks.push({ type: 'list', ordered: listOrdered, items: [...listItems] })
      listItems = []
    }
  }

  function flushQuote() {
    if (quoteLines.length > 0) {
      blocks.push({ type: 'quote', text: quoteLines.join(' ').trim() })
      quoteLines = []
    }
  }

  function flushCode() {
    if (codeLines.length > 0) {
      blocks.push({ type: 'code', text: codeLines.join('\n') })
      codeLines = []
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (inCode) {
      if (line.trim() === '```') {
        inCode = false
        flushParagraph()
        flushList()
        flushQuote()
        flushCode()
        continue
      }
      codeLines.push(rawLine)
      continue
    }

    if (line.trim() === '```') {
      flushParagraph()
      flushList()
      flushQuote()
      inCode = true
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      flushList()
      flushQuote()
      continue
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line)
    if (headingMatch) {
      flushParagraph()
      flushList()
      flushQuote()
      const level = headingMatch[1].length as 1 | 2 | 3
      blocks.push({ type: 'heading', level, text: headingMatch[2] })
      continue
    }

    const imageMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line.trim())
    if (imageMatch) {
      flushParagraph()
      flushList()
      flushQuote()
      blocks.push({ type: 'image', alt: imageMatch[1], url: imageMatch[2] })
      continue
    }

    const quoteMatch = /^>\s?(.*)$/.exec(line)
    if (quoteMatch) {
      flushParagraph()
      flushList()
      quoteLines.push(quoteMatch[1])
      continue
    }

    const orderedMatch = /^(\d+)\.\s+(.*)$/.exec(line)
    const bulletMatch = /^[*-]\s+(.*)$/.exec(line)
    if (orderedMatch || bulletMatch) {
      flushParagraph()
      flushQuote()
      const ordered = Boolean(orderedMatch)
      if (listItems.length === 0) {
        listOrdered = ordered
      }
      if (ordered !== listOrdered) {
        flushList()
        listOrdered = ordered
      }
      listItems.push(orderedMatch ? orderedMatch[2] : bulletMatch?.[1] ?? '')
      continue
    }

    flushList()
    flushQuote()
    paragraph.push(line.trim())
  }

  flushParagraph()
  flushList()
  flushQuote()
  flushCode()

  return blocks
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern =
    /(\[\[[^\]]+\]\]|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^)]+\)|https?:\/\/[^\s)]+|mailto:[^\s)]+)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]
    const wikiLink = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(token)
    const markdownLink = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
    const target = markdownLink ? safeUrl(markdownLink[2]) : safeUrl(token)
    if (wikiLink) {
      const title = (wikiLink[2] || wikiLink[1]).trim()
      nodes.push(
        <button
          type="button"
          key={`${match.index}-${token}`}
          onClick={() => onOpenNoteByTitle?.(title)}
          disabled={!onOpenNoteByTitle}
          className="group inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--sd-accent)] bg-[var(--sd-accent)]/10 px-2.5 py-1 text-[0.9em] font-medium text-[var(--sd-accent)] shadow-sm transition hover:border-[var(--sd-accent)] hover:bg-[var(--sd-accent)]/20 hover:shadow-md disabled:cursor-default disabled:opacity-100"
        >
          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
            <path d="M6.5 1.75a.75.75 0 0 0 0 1.5h2.19L2.47 9.19a.75.75 0 1 0 1.06 1.06L9.75 4.31V6.5a.75.75 0 0 0 1.5 0v-5a.75.75 0 0 0-.75-.75h-5Z" />
            <path d="M10.5 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10.5 2Z" />
            <path d="M3 10.5a.75.75 0 0 0-1.5 0v2.75A1.75 1.75 0 0 0 3.25 15h9.5a1.75 1.75 0 0 0 1.75-1.75v-9.5a1.75 1.75 0 0 0-1.75-1.75h-2.75a.75.75 0 0 0 0 1.5h2.75c.138 0 .25.112.25.25v9.5a.25.25 0 0 1-.25.25H3.25a.25.25 0 0 1-.25-.25v-2.75Z" />
          </svg>
          <span className="max-w-[16rem] truncate">{title}</span>
        </button>
      )
    } else if (target) {
      nodes.push(
        <button
          key={`${match.index}-${token}`}
          type="button"
          onClick={() => openExternalUrl(target)}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--sd-border)] bg-white/[0.05] px-2.5 py-1 text-[0.9em] text-[var(--sd-text-muted)] underline decoration-dotted underline-offset-3 transition hover:border-[var(--sd-text-muted)] hover:bg-white/[0.08]"
        >
          <span className="max-w-[16rem] truncate">
            {markdownLink ? markdownLink[1] : token}
          </span>
          <svg className="h-3 w-3 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      )
    } else {
      nodes.push(token)
    }

    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

export function MarkdownPreview({
  content,
  onOpenNoteByTitle
}: {
  content: string
  onOpenNoteByTitle?: (title: string) => void
}): JSX.Element {
  const blocks = parseBlocks(content)

  return (
    <div className="sd-markdown space-y-5 text-[var(--sd-text)]">
      {blocks.length === 0 ? (
        <p className="text-sm text-[var(--sd-muted)]">Nothing to preview yet.</p>
      ) : null}

      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const sizeClass =
            block.level === 1
              ? 'text-2xl'
              : block.level === 2
                ? 'text-xl'
                : 'text-lg'
          return (
            <h2 key={index} className={`${sizeClass} font-semibold tracking-[-0.03em]`}>
              {renderInline(block.text)}
            </h2>
          )
        }

        if (block.type === 'paragraph') {
          return (
            <p key={index} className="whitespace-pre-wrap leading-7 text-[15px] text-[var(--sd-text)]">
              {renderInline(block.text)}
            </p>
          )
        }

        if (block.type === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul'
          return (
            <Tag
              key={index}
              className={[
                'space-y-2 rounded-[24px] border border-[var(--sd-border)] bg-white/[0.03] p-4 pl-6',
                block.ordered ? 'list-decimal' : 'list-disc'
              ].join(' ')}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${index}-${itemIndex}`} className="pl-2 leading-7 text-[15px]">
                  {renderInline(item)}
                </li>
              ))}
            </Tag>
          )
        }

        if (block.type === 'quote') {
          return (
            <blockquote
              key={index}
              className="rounded-[24px] border border-[var(--sd-border)] bg-[var(--sd-accent-soft)] px-4 py-4 text-[15px] leading-7 text-[var(--sd-text)]"
            >
              {renderInline(block.text)}
            </blockquote>
          )
        }

        if (block.type === 'image') {
          const imageUrl = safeUrl(block.url)
          return (
            <figure
              key={index}
              className="overflow-hidden rounded-[24px] border border-[var(--sd-border)] bg-black/20"
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={block.alt || 'Embedded image'}
                  className="max-h-[420px] w-full object-contain"
                  loading="lazy"
                />
              ) : (
                <div className="flex min-h-40 items-center justify-center px-6 py-10 text-sm text-[var(--sd-muted)]">
                  Invalid image URL
                </div>
              )}
              {(block.alt || imageUrl) ? (
                <figcaption className="border-t border-[var(--sd-border)] px-4 py-3 text-xs text-[var(--sd-muted)]">
                  {block.alt || imageUrl}
                </figcaption>
              ) : null}
            </figure>
          )
        }

        if (block.type === 'code') {
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-[24px] border border-[var(--sd-border)] bg-[#0b1118] p-4 text-[13px] leading-6 text-[#d6e1eb]"
            >
              <code>{block.text}</code>
            </pre>
          )
        }

        return null
      })}
    </div>
  )
}

export function stripMarkdown(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
