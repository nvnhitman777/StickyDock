import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import NoteEditor from '@/features/notes/NoteEditor'
import { NoteTreeView } from '@/features/notes/NoteTreeView'
import { AuthScreen } from '@/features/auth/AuthScreen'
import { LockConfirmModal } from '@/features/auth/LockConfirmModal'
import { dockApi } from '@/services/backend'
import { useDockStore } from '@/store/useDockStore'
import type { AppMetrics, Note, Theme, AuthState } from '@/types/domain'

// Fallback OneDrive functions
const fallbackAuthenticateWithOneDrive = async () => ({
  success: false,
  message: 'OneDrive integration is not available'
})
const fallbackBackupDatabaseToOneDrive = async () => ({
  success: false,
  message: 'OneDrive integration is not available'
})
const fallbackDisconnectOneDrive = async () => ({
  success: false,
  message: 'OneDrive integration is not available'
})
const fallbackIsConnectedToOneDrive = async () => false

// Lazy load OneDrive functions
let oneDriveFunctions: any = null

async function loadOneDriveFunctions() {
  if (oneDriveFunctions) return oneDriveFunctions
  
  try {
    oneDriveFunctions = await import('@/services/onedrive')
    return oneDriveFunctions
  } catch (error) {
    console.warn('OneDrive module failed to load:', error)
    return null
  }
}

function formatUpdatedAt(value: string): string {
  const updatedAt = new Date(value)
  if (Number.isNaN(updatedAt.getTime())) {
    return 'Just now'
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric'
  }).format(updatedAt)
}

function themeLabel(theme: Theme): string {
  if (theme === 'system') {
    return 'System'
  }

  return theme === 'dark' ? 'Dark' : 'Light'
}

function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  return theme
}

function stripText(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (trimmed.startsWith('<')) {
    const doc = new DOMParser().parseFromString(trimmed, 'text/html')
    return doc.body.textContent?.trim() ?? ''
  }

  return trimmed
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function noteGlyph(note: Note): string {
  return note.icon.trim() || 'o'
}

function isImageIcon(value: string): boolean {
  return value.startsWith('data:image/')
}

function reminderStorageKey(noteId: string, reminderAt: string): string {
  return `stickydock.reminder:${noteId}:${reminderAt}`
}

function hasFiredReminder(noteId: string, reminderAt: string): boolean {
  return window.localStorage.getItem(reminderStorageKey(noteId, reminderAt)) === '1'
}

function markReminderFired(noteId: string, reminderAt: string): void {
  window.localStorage.setItem(reminderStorageKey(noteId, reminderAt), '1')
}

function formatReminderDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'the scheduled time'
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`
}

function normalizeWikiTarget(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function extractWikiLinks(content: string): string[] {
  const matches = content.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)
  return Array.from(matches, (match) => (match[1] || match[2] || '').trim()).filter(Boolean)
}

type ReminderPopup = {
  id: string
  title: string
  body: string
}

type GraphNode = {
  id: string
  title: string
  x: number
  y: number
  vx: number
  vy: number
  outgoing: string[]
  inbound: string[]
  parentId?: string | null
  hasChildren: boolean
}

function splitDatabasePath(path: string): { folder: string; fileName: string } {
  const trimmed = path.trim()
  if (!trimmed) {
    return { folder: '', fileName: 'StickyDock.db' }
  }

  const lastSlash = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  if (lastSlash < 0) {
    return { folder: '', fileName: trimmed }
  }

  return {
    folder: trimmed.slice(0, lastSlash),
    fileName: trimmed.slice(lastSlash + 1)
  }
}

function ensureDatabaseFileName(fileName: string): string {
  const trimmed = fileName.trim()
  if (!trimmed) {
    return 'StickyDock.db'
  }

  if (trimmed.toLowerCase().endsWith('.db')) {
    return trimmed
  }

  return `${trimmed}.db`
}

function joinDatabasePath(folder: string, fileName: string): string {
  const cleanedFolder = folder.trim().replace(/[\\/]+$/, '')
  const cleanedFile = ensureDatabaseFileName(fileName)

  if (!cleanedFolder) {
    return cleanedFile
  }

  return `${cleanedFolder}\\${cleanedFile}`
}

function normalizeImportance(value: number): number {
  return Math.max(0, Math.min(3, Math.trunc(value)))
}

function importanceLabel(value: number): string {
  const importance = normalizeImportance(value)
  return importance === 0 ? 'Normal' : '!'.repeat(importance)
}

type SettingsCategory =
  | 'appearance'
  | 'notes'
  | 'editor'
  | 'shortcuts'
  | 'privacy'
  | 'backup'
  | 'about'

type AppPreferences = {
  accentColor: string
  compactMode: boolean
  fontSize: number
  editorFont: string
  defaultNoteColor: string
  defaultPriority: number
  autoSave: boolean
  defaultNoteTemplate: string
  enableMarkdown: boolean
  spellCheck: boolean
  showLineNumbers: boolean
  wordWrap: boolean
  autoLinkUrls: boolean
  openLinksWithCtrlClick: boolean
  autoCompleteMarkdown: boolean
  storeDataLocally: boolean
  enableOneDriveBackup: boolean
  oneDriveConnected: boolean
}

const preferencesStorageKey = 'stickydock.settings'
const accentChoices = ['#7bc8ff', '#7ce3b2', '#f6c177', '#f28bb7', '#a78bfa', '#8d96a6']
const editorFonts = ['Aptos', 'Inter', 'Georgia', 'Courier New', 'SF Pro Text']
const categoryMeta: Array<{
  id: SettingsCategory
  label: string
  description: string
}> = [
  { id: 'appearance', label: 'Appearance', description: 'Theme and typography' },
  { id: 'notes', label: 'Notes', description: 'Default note behavior' },
  { id: 'editor', label: 'Editor', description: 'Writing experience' },
  { id: 'shortcuts', label: 'Shortcuts', description: 'Keyboard control' },
  { id: 'privacy', label: 'Privacy', description: 'Data and local storage' },
  { id: 'backup', label: 'Backup', description: 'Cloud backup and sync' },
  { id: 'about', label: 'About', description: 'Version and links' }
]

const defaultPreferences: AppPreferences = {
  accentColor: '#7bc8ff',
  compactMode: false,
  fontSize: 15,
  editorFont: 'Aptos',
  defaultNoteColor: '#8bd3ff',
  defaultPriority: 0,
  autoSave: true,
  defaultNoteTemplate: '',
  enableMarkdown: true,
  spellCheck: true,
  showLineNumbers: false,
  wordWrap: true,
  autoLinkUrls: true,
  openLinksWithCtrlClick: true,
  autoCompleteMarkdown: true,
  storeDataLocally: true,
  enableOneDriveBackup: false,
  oneDriveConnected: false
}

const viewModeStorageKey = 'stickydock.viewMode'

function loadViewMode(): 'application' | 'browser' {
  try {
    const stored = window.localStorage.getItem(viewModeStorageKey)
    if (stored === 'application' || stored === 'browser') {
      return stored
    }
  } catch {
    // ignore storage errors
  }

  return 'application'
}

function saveViewMode(value: 'application' | 'browser'): void {
  try {
    window.localStorage.setItem(viewModeStorageKey, value)
  } catch {
    // ignore storage errors
  }
}

function loadPreferences(): AppPreferences {
  try {
    const raw = window.localStorage.getItem(preferencesStorageKey)
    if (!raw) {
      return defaultPreferences
    }

    const parsed = JSON.parse(raw) as Partial<AppPreferences>
    return {
      ...defaultPreferences,
      ...parsed
    }
  } catch {
    return defaultPreferences
  }
}

function savePreferences(preferences: AppPreferences): void {
  window.localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences))
}

function openExternalUrl(url: string): void {
  if (window.runtime?.BrowserOpenURL) {
    window.runtime.BrowserOpenURL(url)
    return
  }

  window.open(url, '_blank', 'noopener')
}

function ThemePill({
  active,
  children,
  onClick
}: {
  active: boolean
  children: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        'rounded-full px-4 py-2 text-sm transition',
        active
          ? 'bg-[var(--sd-accent)] text-[var(--sd-accent-contrast)] shadow-[0_10px_24px_rgba(0,0,0,0.16)]'
          : 'border border-[var(--sd-border)] bg-white/5 text-[var(--sd-text)] hover:bg-white/10'
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-[20px] border border-[var(--sd-border)] bg-white/5 px-4 py-3 text-left transition hover:bg-white/8"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--sd-text)]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[var(--sd-muted)]">{description}</span>
      </span>
      <span
        className={[
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-[var(--sd-accent)]' : 'bg-white/15'
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition',
            checked ? 'left-5' : 'left-0.5'
          ].join(' ')}
        />
      </span>
    </button>
  )
}

function SettingsModal({
  isOpen,
  onClose,
  theme,
  onSwitchDatabase
}: {
  isOpen: boolean
  onClose: () => void
  theme: Theme
  onSwitchDatabase: () => void
}): JSX.Element | null {
  const { setTheme } = useDockStore()
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance')
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences)
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setPreferences(loadPreferences())
  }, [isOpen])

  useEffect(() => {
    document.documentElement.style.setProperty('--sd-accent', preferences.accentColor)
    savePreferences(preferences)
  }, [preferences])

  useEffect(() => {
    const resolvedTheme = resolveTheme(theme)
    document.documentElement.dataset.theme = resolvedTheme

    if (theme !== 'system') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light'
    }

    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [theme])

  async function resetPreferences() {
    setPreferences(defaultPreferences)
    await setTheme('dark')
    window.localStorage.removeItem(preferencesStorageKey)
    document.documentElement.style.setProperty('--sd-accent', defaultPreferences.accentColor)
  }

  async function openAppDataFolder() {
    setIsBusy(true)
    try {
      await dockApi.openAppDataFolder()
    } finally {
      setIsBusy(false)
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-md" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-6xl overflow-hidden rounded-[34px] border border-[var(--sd-border)] bg-[var(--sd-panel-strong)] shadow-[0_30px_100px_rgba(0,0,0,0.38)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--sd-border)] px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-[var(--sd-muted)]">Settings</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[var(--sd-text)]">
              Preferences
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--sd-border)] bg-white/5 px-4 py-2 text-xs font-medium text-[var(--sd-text)] transition hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="grid min-h-[640px] grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-r border-[var(--sd-border)] bg-[rgba(255,255,255,0.02)] p-4">
            <div className="space-y-1">
              {categoryMeta.map((category) => {
                const active = category.id === activeCategory
                return (
                  <button
                    type="button"
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={[
                      'flex w-full items-start gap-3 rounded-[20px] px-4 py-3 text-left transition',
                      active ? 'bg-white/8' : 'hover:bg-white/5'
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'mt-0.5 h-2.5 w-2.5 rounded-full',
                        active ? 'bg-[var(--sd-accent)]' : 'bg-white/20'
                      ].join(' ')}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--sd-text)]">
                        {category.label}
                      </span>
                      <span className="block text-xs leading-5 text-[var(--sd-muted)]">
                        {category.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto p-6">
            {activeCategory === 'appearance' ? (
              <div className="grid gap-6">
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--sd-text)]">
                    Appearance
                  </h3>
                  <p className="mt-1 text-sm text-[var(--sd-muted)]">
                    Control the overall look and feel of the app.
                  </p>
                </div>

                <div className="grid gap-4 rounded-[24px] border border-[var(--sd-border)] bg-white/4 p-5">
                  <div>
                    <p className="text-sm font-medium text-[var(--sd-text)]">Theme</p>
                    <p className="mt-1 text-xs text-[var(--sd-muted)]">
                      Match the system, or force light or dark mode.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ThemePill active={theme === 'system'} onClick={() => void setTheme('system')}>
                      System
                    </ThemePill>
                    <ThemePill active={theme === 'dark'} onClick={() => void setTheme('dark')}>
                      Dark
                    </ThemePill>
                    <ThemePill active={theme === 'light'} onClick={() => void setTheme('light')}>
                      Light
                    </ThemePill>
                  </div>

                  <div className="grid gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--sd-text)]">Accent color</p>
                      <p className="mt-1 text-xs text-[var(--sd-muted)]">Used for selection and highlights.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {accentChoices.map((color) => (
                        <button
                          type="button"
                          key={color}
                          onClick={() => setPreferences((prev) => ({ ...prev, accentColor: color }))}
                          className={[
                            'h-10 w-10 rounded-full border transition',
                            preferences.accentColor === color
                              ? 'scale-105 border-white/70 shadow-[0_0_0_3px_rgba(255,255,255,0.08)]'
                              : 'border-white/10 hover:scale-105'
                          ].join(' ')}
                          style={{ backgroundColor: color }}
                          aria-label={`Accent ${color}`}
                        />
                      ))}
                    </div>
                  </div>

                  <ToggleRow
                    label="Compact mode"
                    description="Tighten spacing across the interface."
                    checked={preferences.compactMode}
                    onChange={(value) => setPreferences((prev) => ({ ...prev, compactMode: value }))}
                  />

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-[var(--sd-text)]">Font size</span>
                      <span className="text-xs text-[var(--sd-muted)]">{preferences.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="13"
                      max="19"
                      value={preferences.fontSize}
                      onChange={(event) =>
                        setPreferences((prev) => ({ ...prev, fontSize: Number(event.target.value) }))
                      }
                      className="w-full accent-[var(--sd-accent)]"
                    />
                  </div>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[var(--sd-text)]">Editor font</span>
                    <select
                      value={preferences.editorFont}
                      onChange={(event) =>
                        setPreferences((prev) => ({ ...prev, editorFont: event.target.value }))
                      }
                      className="rounded-[18px] border border-[var(--sd-border)] bg-black/10 px-4 py-3 text-sm text-[var(--sd-text)] outline-none focus:border-[var(--sd-accent)]"
                    >
                      {editorFonts.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : null}

            {activeCategory === 'notes' ? (
              <div className="grid gap-6">
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--sd-text)]">
                    Notes
                  </h3>
                  <p className="mt-1 text-sm text-[var(--sd-muted)]">
                    Set defaults for new notes.
                  </p>
                </div>

                <div className="grid gap-4 rounded-[24px] border border-[var(--sd-border)] bg-white/4 p-5">
                  <div>
                    <p className="text-sm font-medium text-[var(--sd-text)]">Default note color</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {accentChoices.map((color) => (
                        <button
                          type="button"
                          key={color}
                          onClick={() => setPreferences((prev) => ({ ...prev, defaultNoteColor: color }))}
                          className={[
                            'h-9 w-9 rounded-full border transition',
                            preferences.defaultNoteColor === color ? 'border-white/70' : 'border-white/10'
                          ].join(' ')}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[var(--sd-text)]">Default priority</span>
                    <div className="flex flex-wrap gap-2">
                      {[
                        ['Normal', 0],
                        ['Low', 1],
                        ['Medium', 2],
                        ['High', 3]
                      ].map(([label, value]) => (
                        <ThemePill
                          key={label}
                          active={preferences.defaultPriority === value}
                          onClick={() => setPreferences((prev) => ({ ...prev, defaultPriority: value as number }))}
                        >
                          {label as string}
                        </ThemePill>
                      ))}
                    </div>
                  </label>

                  <ToggleRow
                    label="Auto save"
                    description="Save edits automatically as you write."
                    checked={preferences.autoSave}
                    onChange={(value) => setPreferences((prev) => ({ ...prev, autoSave: value }))}
                  />

                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-[var(--sd-text)]">Default note template</span>
                    <textarea
                      value={preferences.defaultNoteTemplate}
                      onChange={(event) =>
                        setPreferences((prev) => ({ ...prev, defaultNoteTemplate: event.target.value }))
                      }
                      placeholder="Start with a title, then write..."
                      className="min-h-28 rounded-[18px] border border-[var(--sd-border)] bg-white/5 px-4 py-3 text-sm text-[var(--sd-text)] outline-none placeholder:text-[var(--sd-muted)]"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {activeCategory === 'editor' ? (
              <div className="grid gap-6">
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--sd-text)]">
                    Editor
                  </h3>
                  <p className="mt-1 text-sm text-[var(--sd-muted)]">
                    Tune the writing surface.
                  </p>
                </div>

                <div className="grid gap-3 rounded-[24px] border border-[var(--sd-border)] bg-white/4 p-5">
                  <ToggleRow
                    label="Enable Markdown"
                    description="Use Markdown shortcuts while typing."
                    checked={preferences.enableMarkdown}
                    onChange={(value) => setPreferences((prev) => ({ ...prev, enableMarkdown: value }))}
                  />
                  <ToggleRow
                    label="Spell check"
                    description="Underline misspelled words as you write."
                    checked={preferences.spellCheck}
                    onChange={(value) => setPreferences((prev) => ({ ...prev, spellCheck: value }))}
                  />
                  <ToggleRow
                    label="Show line numbers"
                    description="Helpful for code blocks and long notes."
                    checked={preferences.showLineNumbers}
                    onChange={(value) => setPreferences((prev) => ({ ...prev, showLineNumbers: value }))}
                  />
                  <ToggleRow
                    label="Word wrap"
                    description="Keep paragraphs readable without horizontal scrolling."
                    checked={preferences.wordWrap}
                    onChange={(value) => setPreferences((prev) => ({ ...prev, wordWrap: value }))}
                  />
                  <ToggleRow
                    label="Auto link URLs"
                    description="Turn pasted URLs into clickable links."
                    checked={preferences.autoLinkUrls}
                    onChange={(value) => setPreferences((prev) => ({ ...prev, autoLinkUrls: value }))}
                  />
                  <ToggleRow
                    label="Open links with Ctrl+Click"
                    description="Keep link navigation intentional while writing."
                    checked={preferences.openLinksWithCtrlClick}
                    onChange={(value) =>
                      setPreferences((prev) => ({ ...prev, openLinksWithCtrlClick: value }))
                    }
                  />
                  <ToggleRow
                    label="Auto complete Markdown"
                    description="Help finish formatting patterns as you type."
                    checked={preferences.autoCompleteMarkdown}
                    onChange={(value) =>
                      setPreferences((prev) => ({ ...prev, autoCompleteMarkdown: value }))
                    }
                  />
                </div>
              </div>
            ) : null}

            {activeCategory === 'shortcuts' ? (
              <div className="grid gap-6">
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--sd-text)]">
                    Shortcuts
                  </h3>
                  <p className="mt-1 text-sm text-[var(--sd-muted)]">
                    Keyboard-first controls for fast navigation and formatting.
                  </p>
                </div>

                <div className="grid gap-3 rounded-[24px] border border-[var(--sd-border)] bg-white/4 p-5">
                  {[
                    ['Ctrl+K', 'Open command palette'],
                    ['Ctrl+B', 'Bold'],
                    ['Ctrl+I', 'Italic'],
                    ['Ctrl+Shift+V', 'Paste without formatting'],
                    ['Ctrl+Click', 'Open hyperlinks']
                  ].map(([shortcut, meaning]) => (
                    <div key={shortcut} className="flex items-center justify-between gap-4 rounded-[18px] bg-white/5 px-4 py-3">
                      <span className="text-sm text-[var(--sd-text)]">{meaning}</span>
                      <span className="rounded-full border border-[var(--sd-border)] bg-black/10 px-3 py-1 text-[11px] text-[var(--sd-muted)]">
                        {shortcut}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {activeCategory === 'privacy' ? (
              <div className="grid gap-6">
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--sd-text)]">
                    Privacy
                  </h3>
                  <p className="mt-1 text-sm text-[var(--sd-muted)]">
                    Keep data local and easy to manage.
                  </p>
                </div>

                <div className="grid gap-4 rounded-[24px] border border-[var(--sd-border)] bg-white/4 p-5">
                  <ToggleRow
                    label="Store data locally"
                    description="Keep everything on this device."
                    checked={preferences.storeDataLocally}
                    onChange={(value) =>
                      setPreferences((prev) => ({ ...prev, storeDataLocally: value }))
                    }
                  />

                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onSwitchDatabase()
                    }}
                    className="rounded-[18px] border border-[var(--sd-border)] bg-white/5 px-4 py-3 text-left text-sm text-[var(--sd-text)] transition hover:bg-white/10"
                  >
                    Switch database
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void openAppDataFolder()}
                    className="rounded-[18px] border border-[var(--sd-border)] bg-white/5 px-4 py-3 text-left text-sm text-[var(--sd-text)] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Open Application Data Folder
                  </button>

                  <button
                    type="button"
                    onClick={() => void resetPreferences()}
                    className="rounded-[18px] border border-[rgba(255,110,129,0.16)] bg-[rgba(255,110,129,0.08)] px-4 py-3 text-left text-sm text-[var(--sd-danger)] transition hover:bg-[rgba(255,110,129,0.12)]"
                  >
                    Reset application settings
                  </button>

                  <button
                    type="button"
                    disabled
                    className="rounded-[18px] border border-[var(--sd-border)] bg-white/5 px-4 py-3 text-left text-sm text-[var(--sd-muted)]"
                  >
                    Clear cache
                  </button>
                </div>
              </div>
            ) : null}

            {activeCategory === 'backup' ? (
              <div className="grid gap-6">
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--sd-text)]">
                    Backup & Sync
                  </h3>
                  <p className="mt-1 text-sm text-[var(--sd-muted)]">
                    Backup your database to Microsoft OneDrive for secure cloud storage.
                  </p>
                </div>

                <div className="grid gap-4 rounded-[24px] border border-[var(--sd-border)] bg-white/4 p-5">
                  <ToggleRow
                    label="OneDrive Backup"
                    description="Back up your notes to your Microsoft OneDrive for safe cloud storage"
                    checked={preferences.enableOneDriveBackup}
                    onChange={(value) =>
                      setPreferences((prev) => ({ ...prev, enableOneDriveBackup: value }))
                    }
                  />

                  {preferences.enableOneDriveBackup && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={async () => {
                          setIsBusy(true)
                          try {
                            const oneDrive = await loadOneDriveFunctions()
                            const authenticateFunc = oneDrive?.authenticateWithOneDrive || fallbackAuthenticateWithOneDrive
                            const result = await authenticateFunc()
                            if (result.success) {
                              setPreferences((prev) => ({ ...prev, oneDriveConnected: true }))
                              alert(result.message || 'Successfully connected to OneDrive!')
                            } else {
                              alert('Failed to connect: ' + (result.message || 'Unknown error'))
                            }
                          } catch (error) {
                            alert('Error connecting to OneDrive: ' + (error instanceof Error ? error.message : 'Unknown error'))
                          } finally {
                            setIsBusy(false)
                          }
                        }}
                        className={`rounded-[18px] border px-4 py-3 text-left text-sm transition ${
                          preferences.oneDriveConnected
                            ? 'border-[rgba(74,222,128,0.3)] bg-[rgba(74,222,128,0.08)] text-[var(--sd-text)] hover:bg-[rgba(74,222,128,0.12)]'
                            : 'border-[var(--sd-border)] bg-white/5 text-[var(--sd-text)] hover:bg-white/10'
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {isBusy ? 'Connecting...' : preferences.oneDriveConnected ? '✓ Connected to OneDrive' : 'Connect to OneDrive'}
                      </button>

                      {preferences.oneDriveConnected && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setIsBusy(true)
                              try {
                                const oneDrive = await loadOneDriveFunctions()
                                const isConnectedFunc = oneDrive?.isConnectedToOneDrive || fallbackIsConnectedToOneDrive
                                const isConnected = await isConnectedFunc()
                                
                                // First, check if connected
                                if (!isConnected) {
                                  alert('Please connect to OneDrive first by clicking "Connect to OneDrive"')
                                  setIsBusy(false)
                                  return
                                }

                                // Get the database file path and read it
                                const dbPath = await dockApi.getBackupDatabasePath()
                                const fileData = await dockApi.readDatabaseFile(dbPath)
                                const timestamp = new Date().toISOString().split('T')[0]
                                const fileName = `stickydock-backup-${timestamp}.db`

                                // Upload to OneDrive
                                const backupFunc = oneDrive?.backupDatabaseToOneDrive || fallbackBackupDatabaseToOneDrive
                                const result = await backupFunc(fileData, fileName)
                                if (result.success) {
                                  alert('Backup completed successfully!\n' + (result.timestamp ? `Backed up at: ${result.timestamp}` : ''))
                                } else {
                                  alert('Backup failed: ' + (result.message || 'Unknown error'))
                                }
                              } catch (error) {
                                alert('Error during backup: ' + (error instanceof Error ? error.message : 'Unknown error'))
                              } finally {
                                setIsBusy(false)
                              }
                            }}
                            className="rounded-[18px] border border-[var(--sd-border)] bg-white/5 px-4 py-3 text-left text-sm text-[var(--sd-text)] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? 'Backing up...' : 'Backup Now'}
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setIsBusy(true)
                              try {
                                const oneDrive = await loadOneDriveFunctions()
                                const disconnectFunc = oneDrive?.disconnectOneDrive || fallbackDisconnectOneDrive
                                const result = await disconnectFunc()
                                if (result.success) {
                                  setPreferences((prev) => ({ ...prev, oneDriveConnected: false }))
                                  alert(result.message || 'Disconnected from OneDrive. Backups are disabled.')
                                } else {
                                  alert('Failed to disconnect: ' + (result.message || 'Unknown error'))
                                }
                              } catch (error) {
                                alert('Error disconnecting: ' + (error instanceof Error ? error.message : 'Unknown error'))
                              } finally {
                                setIsBusy(false)
                              }
                            }}
                            className="rounded-[18px] border border-[rgba(255,110,129,0.16)] bg-[rgba(255,110,129,0.08)] px-4 py-3 text-left text-sm text-[var(--sd-danger)] transition hover:bg-[rgba(255,110,129,0.12)] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isBusy ? 'Disconnecting...' : 'Disconnect from OneDrive'}
                          </button>
                        </>
                      )}

                      <div className="rounded-[18px] border border-[var(--sd-border)] bg-white/3 p-4">
                        <p className="text-xs font-semibold text-[var(--sd-text)]">📌 OneDrive Backup</p>
                        <ul className="mt-2 space-y-1 text-xs text-[var(--sd-muted)]">
                          <li>• Click "Connect to OneDrive" and sign in with your Microsoft account</li>
                          <li>• Click "Backup Now" to save your database to your OneDrive</li>
                          <li>• Backups include full database with all your notes</li>
                          <li>• You control when backups happen - no automatic syncing</li>
                          <li>• Only you can access your backups - fully private and secure</li>
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : null}

            {activeCategory === 'about' ? (
              <div className="grid gap-6">
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.02em] text-[var(--sd-text)]">
                    About
                  </h3>
                  <p className="mt-1 text-sm text-[var(--sd-muted)]">
                    Product information and project links.
                  </p>
                </div>

                <div className="grid gap-4 rounded-[24px] border border-[var(--sd-border)] bg-white/4 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-[var(--sd-text)]">Application version</p>
                      <p className="mt-1 text-xs text-[var(--sd-muted)]">StickyDock 1.0.0</p>
                    </div>
                    <button
                      type="button"
                      disabled
                      className="rounded-[18px] border border-[var(--sd-border)] bg-white/5 px-4 py-3 text-sm text-[var(--sd-muted)]"
                    >
                      Check for updates
                    </button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      disabled
                      className="rounded-[18px] border border-[var(--sd-border)] bg-white/5 px-4 py-3 text-sm text-[var(--sd-muted)]"
                    >
                      Release notes
                    </button>
                    <button
                      type="button"
                      onClick={() => openExternalUrl('https://github.com/nvnhitman777/StickyDock')}
                      className="rounded-[18px] border border-[var(--sd-border)] bg-white/5 px-4 py-3 text-sm text-[var(--sd-text)] transition hover:bg-white/10"
                    >
                      GitHub repository
                    </button>
                    <button
                      type="button"
                      disabled
                      className="rounded-[18px] border border-[var(--sd-border)] bg-white/5 px-4 py-3 text-sm text-[var(--sd-muted)]"
                    >
                      License
                    </button>
                  </div>

                  <div className="mt-2 rounded-[18px] border border-[var(--sd-border)] bg-white/3 p-4">
                    <p className="text-xs font-semibold text-[var(--sd-text)]">👥 Credits</p>
                    <p className="mt-2 text-xs text-[var(--sd-muted)]">
                      Developed by <span className="font-medium text-[var(--sd-text)]">Naveen R</span>
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </motion.div>
    </div>
  )
}

function MetricsModal({
  isOpen,
  isLoading,
  metrics,
  error,
  onClose,
  onRefresh
}: {
  isOpen: boolean
  isLoading: boolean
  metrics: AppMetrics | null
  error: string | null
  onClose: () => void
  onRefresh: () => Promise<void>
}): JSX.Element | null {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.84)] px-4 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-[620px] overflow-hidden rounded-[32px] border border-white/[0.08] bg-[rgba(11,15,21,0.96)] shadow-[0_40px_120px_rgba(0,0,0,0.35)]"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-[var(--sd-muted)]">Diagnostics</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[var(--sd-text)]">Memory & Database Stats</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={isLoading}
              className="rounded-full border border-[var(--sd-border)] bg-white/[0.04] px-4 py-2 text-xs text-[var(--sd-text)] transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--sd-border)] bg-white/[0.04] px-4 py-2 text-xs text-[var(--sd-text)] transition hover:bg-white/[0.08]"
            >
              Close
            </button>
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-6 text-center text-[var(--sd-muted)]">
              Loading metrics...
            </div>
          ) : error ? (
            <div className="rounded-[24px] border border-[rgba(255,110,129,0.2)] bg-[rgba(255,110,129,0.08)] p-6 text-sm text-[var(--sd-text)]">
              <p className="font-semibold text-[var(--sd-text)]">Unable to load stats</p>
              <p className="mt-2 text-[var(--sd-muted)]">{error}</p>
            </div>
          ) : !metrics ? (
            <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-6 text-center text-[var(--sd-muted)]">
              No metrics available.
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-5">
                <p className="text-sm font-medium text-[var(--sd-text)]">Database</p>
                <p className="mt-2 text-xs text-[var(--sd-muted)] break-all">{metrics.databasePath}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-5">
                  <p className="text-sm font-medium text-[var(--sd-text)]">Database size</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--sd-text)]">{formatBytes(metrics.databaseSizeBytes)}</p>
                </div>
                <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-5">
                  <p className="text-sm font-medium text-[var(--sd-text)]">Notes in DB</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--sd-text)]">{metrics.notesCount}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-5">
                  <p className="text-sm font-medium text-[var(--sd-text)]">Memory usage</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--sd-text)]">{formatBytes(metrics.memoryUsageBytes)}</p>
                </div>
                <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] p-5">
                  <p className="text-sm font-medium text-[var(--sd-text)]">Goroutines</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--sd-text)]">{metrics.goroutines}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function DatabasePickerModal({
  isOpen,
  storageInfo,
  onOpenWorkspace,
  onOpenKnownDatabase,
  onBrowseExisting,
  onChooseFolder,
  onCreateDatabase
}: {
  isOpen: boolean
  storageInfo: { databasePath: string; databaseName: string; knownDatabasePaths: string[] } | null
  onOpenWorkspace: () => Promise<void>
  onOpenKnownDatabase: (path: string) => Promise<void>
  onBrowseExisting: () => Promise<void>
  onChooseFolder: () => Promise<string | null>
  onCreateDatabase: (folder: string, fileName: string) => Promise<void>
}): JSX.Element | null {
  const [folder, setFolder] = useState('')
  const [fileName, setFileName] = useState('StickyDock.db')
  const [isBusy, setIsBusy] = useState(false)
  const activePath = storageInfo?.databasePath ?? 'StickyDock.db'
  const activeName = storageInfo?.databaseName ?? 'StickyDock.db'
  const knownPaths = storageInfo?.knownDatabasePaths ?? []
  const currentFolder = splitDatabasePath(activePath).folder

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const seed = splitDatabasePath(storageInfo?.databasePath ?? 'StickyDock.db')
    setFolder(seed.folder)
    setFileName(seed.fileName)
    setIsBusy(false)
  }, [isOpen, storageInfo?.databasePath])

  if (!isOpen) {
    return null
  }

  async function handleChooseFolder() {
    const selectedFolder = await onChooseFolder()
    if (selectedFolder !== null) {
      setFolder(selectedFolder)
    }
  }

  async function handleOpenWorkspace() {
    setIsBusy(true)
    try {
      await onOpenWorkspace()
    } finally {
      setIsBusy(false)
    }
  }

  async function handleBrowseExisting() {
    setIsBusy(true)
    try {
      await onBrowseExisting()
    } finally {
      setIsBusy(false)
    }
  }

  async function handleCreateDatabase() {
    setIsBusy(true)
    try {
      await onCreateDatabase(folder, fileName)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.72)] px-4 py-6 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-[760px] overflow-hidden rounded-[32px] border border-white/[0.08] bg-[rgba(11,15,21,0.98)] shadow-[0_28px_90px_rgba(0,0,0,0.45)]"
      >
        <div className="border-b border-white/[0.06] px-6 py-5">
          <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--sd-muted)]">
            Database
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-[var(--sd-text)]">
            Choose a workspace
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--sd-muted)]">
            Open the last workspace, switch to another `.db`, or create a new database in a folder
            you choose.
          </p>
        </div>

        <div className="grid gap-5 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="grid gap-3">
            <div className="rounded-[26px] border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                Current workspace
              </p>
              <p className="mt-2 text-base font-medium text-[var(--sd-text)]">{activeName}</p>
              <p className="mt-1 break-all text-xs leading-5 text-[var(--sd-muted)]">{activePath}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleOpenWorkspace()}
                  disabled={isBusy}
                  className="rounded-full bg-[var(--sd-accent)] px-4 py-2 text-sm font-medium text-[var(--sd-accent-contrast)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Open workspace
                </button>
                <button
                  type="button"
                  onClick={() => void handleBrowseExisting()}
                  disabled={isBusy}
                  className="rounded-full border border-[var(--sd-border)] bg-white/5 px-4 py-2 text-sm text-[var(--sd-text)] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Open existing DB
                </button>
              </div>
            </div>

            <div className="rounded-[26px] border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                Known databases
              </p>
              <div className="mt-3 grid gap-2">
                {knownPaths.length > 0 ? (
                  knownPaths.map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => void onOpenKnownDatabase(path)}
                      disabled={isBusy}
                      className="rounded-[18px] border border-white/[0.06] bg-black/10 px-4 py-3 text-left transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="block text-sm font-medium text-[var(--sd-text)]">
                        {splitDatabasePath(path).fileName}
                      </span>
                      <span className="mt-1 block break-all text-xs text-[var(--sd-muted)]">
                        {path}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="rounded-[18px] border border-dashed border-white/[0.08] bg-black/10 px-4 py-5 text-sm text-[var(--sd-muted)]">
                    No saved database list yet.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-[26px] border border-white/[0.06] bg-white/[0.03] p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
              Create new database
            </p>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-2">
                <span className="text-xs text-[var(--sd-muted)]">Folder</span>
                <div className="flex gap-2">
                  <input
                    value={folder}
                    onChange={(event) => setFolder(event.target.value)}
                    placeholder={currentFolder || 'Choose a folder'}
                    className="min-w-0 flex-1 rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm text-[var(--sd-text)] outline-none placeholder:text-[var(--sd-muted)] focus:border-[var(--sd-accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleChooseFolder()}
                    disabled={isBusy}
                    className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-[var(--sd-text)] transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Browse
                  </button>
                </div>
              </label>

              <label className="grid gap-2">
                <span className="text-xs text-[var(--sd-muted)]">File name</span>
                <input
                  value={fileName}
                  onChange={(event) => setFileName(event.target.value)}
                  placeholder="StickyDock.db"
                  className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm text-[var(--sd-text)] outline-none placeholder:text-[var(--sd-muted)] focus:border-[var(--sd-accent)]"
                />
              </label>

              <button
                type="button"
                onClick={() => void handleCreateDatabase()}
                disabled={isBusy}
                className="rounded-2xl bg-[var(--sd-accent)] px-4 py-3 text-sm font-medium text-[var(--sd-accent-contrast)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create database
              </button>

              <p className="text-xs leading-5 text-[var(--sd-muted)]">
                If the file does not exist, StickyDock will create it when you open the path.
              </p>
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  )
}

function GraphModal({
  isOpen,
  notes,
  selectedNoteId,
  onClose,
  onSelectNote
}: {
  isOpen: boolean
  notes: Note[]
  selectedNoteId: string | null
  onClose: () => void
  onSelectNote: (id: string) => void
}): JSX.Element | null {
  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null
  const [searchQuery, setSearchQuery] = useState('')
  const [frameCount, setFrameCount] = useState(0)
  const animationRef = useRef<number | null>(null)
  const nodesRef = useRef<GraphNode[]>([])

  const graph = useMemo(() => {
    const noteByKey = new Map(notes.map((note) => [normalizeWikiTarget(note.title), note]))
    const nodes: GraphNode[] = notes.map((note) => {
      const outgoingTargets = extractWikiLinks(note.content)
      const outgoing = outgoingTargets
        .map((target) => noteByKey.get(normalizeWikiTarget(target))?.id)
        .filter((id): id is string => Boolean(id))

      return {
        id: note.id,
        title: note.title.trim() || 'Untitled note',
        x: 340 + (Math.random() - 0.5) * 100,
        y: 250 + (Math.random() - 0.5) * 100,
        vx: 0,
        vy: 0,
        outgoing,
        inbound: [],
        parentId: note.parentId,
        hasChildren: notes.some((n) => n.parentId === note.id)
      }
    })

    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    for (const node of nodes) {
      for (const targetId of node.outgoing) {
        const target = nodeById.get(targetId)
        if (target) {
          target.inbound.push(node.id)
        }
      }
    }

    nodesRef.current = nodes
    return { nodes, nodeById }
  }, [notes])

  // Force simulation loop
  useEffect(() => {
    if (!isOpen) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
      }
      return
    }

    const edges: Array<[GraphNode, GraphNode]> = []
    for (const node of nodesRef.current) {
      for (const targetId of node.outgoing) {
        const target = graph.nodeById.get(targetId)
        if (target) {
          edges.push([node, target])
        }
      }
    }

    const simulate = () => {
      const centerX = 340
      const centerY = 250
      const repulsion = 120
      const attraction = 0.03
      const damping = 0.85
      const centerPull = 0.001

      // Reset velocities based on damping
      for (const node of nodesRef.current) {
        node.vx *= damping
        node.vy *= damping
      }

      // Repulsive forces between all nodes
      for (let i = 0; i < nodesRef.current.length; i++) {
        for (let j = i + 1; j < nodesRef.current.length; j++) {
          const a = nodesRef.current[i]
          const b = nodesRef.current[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = repulsion / (dist * dist)

          a.vx -= (force * dx) / dist
          a.vy -= (force * dy) / dist
          b.vx += (force * dx) / dist
          b.vy += (force * dy) / dist
        }
      }

      // Attractive forces along edges
      for (const [source, target] of edges) {
        const dx = target.x - source.x
        const dy = target.y - source.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = attraction * dist

        source.vx += (force * dx) / dist
        source.vy += (force * dy) / dist
        target.vx -= (force * dx) / dist
        target.vy -= (force * dy) / dist
      }

      // Center attraction
      for (const node of nodesRef.current) {
        const dx = centerX - node.x
        const dy = centerY - node.y
        node.vx += dx * centerPull
        node.vy += dy * centerPull
      }

      // Update positions
      for (const node of nodesRef.current) {
        node.x += node.vx
        node.y += node.vy
        // Clamp to canvas bounds with padding
        node.x = Math.max(40, Math.min(640, node.x))
        node.y = Math.max(40, Math.min(460, node.y))
      }

      setFrameCount((prev) => prev + 1)
      animationRef.current = requestAnimationFrame(simulate)
    }

    animationRef.current = requestAnimationFrame(simulate)

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isOpen, graph])

  if (!isOpen) {
    return null
  }

  const searchQueryLower = searchQuery.toLowerCase()
  const filteredNodes = graph.nodes.filter(
    (node) =>
      !searchQuery || node.title.toLowerCase().includes(searchQueryLower)
  )

  const selectedNode = selectedNote ? graph.nodeById.get(selectedNote.id) ?? null : null
  const linkedNodes = selectedNode
    ? selectedNode.outgoing
        .map((id) => graph.nodeById.get(id))
        .filter((node): node is GraphNode => node !== undefined)
    : []
  const backlinkNodes = selectedNode
    ? selectedNode.inbound
        .map((id) => graph.nodeById.get(id))
        .filter((node): node is GraphNode => node !== undefined)
    : []

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(5,8,12,0.78)] px-4 py-6 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-[1120px] overflow-hidden rounded-[34px] border border-white/[0.08] bg-[rgba(11,15,21,0.98)] shadow-[0_32px_110px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-[var(--sd-muted)]">
              Graph
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[var(--sd-text)]">
              Note connections
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs text-[var(--sd-text)] transition hover:bg-white/[0.08]"
          >
            Close
          </button>
        </div>

        <div className="grid min-h-[720px] gap-0 lg:grid-cols-[1fr_340px]">
          <div className="relative min-h-[420px] border-b border-white/[0.06] lg:border-b-0 lg:border-r lg:border-white/[0.06]">
            <svg
              viewBox="0 0 680 500"
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="sd-graph-line" x1="0%" x2="100%" y1="0%" y2="0%">
                  <stop offset="0%" stopColor="rgba(123,200,255,0.28)" />
                  <stop offset="100%" stopColor="rgba(123,200,255,0.75)" />
                </linearGradient>
                <radialGradient id="sd-node-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(123,200,255,0.35)" />
                  <stop offset="100%" stopColor="rgba(123,200,255,0)" />
                </radialGradient>
              </defs>

              {filteredNodes.flatMap((node) =>
                node.outgoing.map((targetId) => {
                  const target = graph.nodeById.get(targetId)
                  if (!target || !filteredNodes.includes(target)) {
                    return null
                  }

                  return (
                    <line
                      key={`${node.id}-${target.id}`}
                      x1={node.x}
                      y1={node.y}
                      x2={target.x}
                      y2={target.y}
                      stroke="url(#sd-graph-line)"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  )
                })
              )}

              {filteredNodes.map((node) => {
                const isActive = node.id === selectedNoteId
                const isRoot = !node.parentId  // No parent = root
                const isParent = node.hasChildren  // Has children
                const isChild = !!node.parentId  // Has parent
                
                // Determine color based on hierarchy
                let fillColor = 'rgba(123,200,255,0.6)'  // Default (linked only)
                let accentColor = 'rgba(123,200,255,1)'
                
                if (isRoot && isParent) {
                  // Root with children - green (primary)
                  fillColor = 'rgba(74,222,128,0.6)'
                  accentColor = 'rgba(74,222,128,1)'
                } else if (isRoot) {
                  // Root without children - teal
                  fillColor = 'rgba(45,212,191,0.6)'
                  accentColor = 'rgba(45,212,191,1)'
                } else if (isParent) {
                  // Child that has its own children - orange
                  fillColor = 'rgba(251,146,60,0.6)'
                  accentColor = 'rgba(251,146,60,1)'
                } else if (isChild) {
                  // Child without children - purple
                  fillColor = 'rgba(168,85,247,0.6)'
                  accentColor = 'rgba(168,85,247,1)'
                }
                
                const baseRadius = isActive ? 20 : 14
                const glowRadius = isActive ? 44 : 32
                
                return (
                  <g key={node.id} onClick={() => onSelectNote(node.id)} className="cursor-pointer">
                    {/* Glow */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={glowRadius}
                      fill={fillColor}
                      opacity="0.2"
                    />
                    {/* Main circle */}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={baseRadius}
                      fill={isActive ? accentColor : fillColor}
                      stroke={isActive ? 'rgba(255,255,255,0.8)' : accentColor}
                      strokeWidth={isActive ? 2 : 1.5}
                      opacity={isActive ? 1 : 0.8}
                    />
                    {/* Indicator for hierarchy status */}
                    {(isRoot || isParent) && (
                      <circle
                        cx={node.x + baseRadius - 2}
                        cy={node.y - baseRadius + 2}
                        r="3"
                        fill={isParent ? 'rgba(251,146,60,1)' : 'rgba(74,222,128,1)'}
                      />
                    )}
                    {/* Label */}
                    <text
                      x={node.x}
                      y={node.y + glowRadius + 14}
                      textAnchor="middle"
                      className="fill-[var(--sd-text)] text-[10px] font-medium"
                    >
                      {node.title.length > 16 ? `${node.title.slice(0, 16)}…` : node.title}
                    </text>
                    {/* Hierarchy indicator text */}
                    <text
                      x={node.x}
                      y={node.y + glowRadius + 25}
                      textAnchor="middle"
                      className="fill-[var(--sd-muted)] text-[8px]"
                    >
                      {isRoot && isParent && '📁 Root'}
                      {isRoot && !isParent && '◆'}
                      {isChild && isParent && '📂 Branch'}
                      {isChild && !isParent && '◇ Child'}
                    </text>
                  </g>
                )
              })}
            </svg>

            <div className="absolute left-4 top-4 flex gap-2">
              <div className="rounded-full border border-white/[0.06] bg-black/20 px-3 py-2 text-xs text-[var(--sd-muted)]">
                {filteredNodes.length} of {graph.nodes.length} notes
              </div>
            </div>

            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="absolute right-4 top-4 rounded-full border border-white/[0.06] bg-black/20 px-4 py-2 text-sm text-[var(--sd-text)] placeholder-[var(--sd-muted)] outline-none transition focus:border-white/[0.12] focus:bg-black/30"
            />
          </div>

          <aside className="grid min-h-0 gap-4 p-5">
            <div className="rounded-[26px] border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                Selected note
              </p>
              <p className="mt-2 text-base font-medium text-[var(--sd-text)]">
                {selectedNode?.title ?? 'No note selected'}
              </p>
              <p className="mt-1 break-all text-xs leading-5 text-[var(--sd-muted)]">
                {selectedNote?.id ?? ''}
              </p>
            </div>

            <div className="rounded-[26px] border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                Hierarchy Legend
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'rgba(74,222,128,0.8)' }} />
                  <span className="text-xs text-[var(--sd-text)]">Root with children</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'rgba(45,212,191,0.8)' }} />
                  <span className="text-xs text-[var(--sd-text)]">Root (standalone)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'rgba(251,146,60,0.8)' }} />
                  <span className="text-xs text-[var(--sd-text)]">Parent branch</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'rgba(168,85,247,0.8)' }} />
                  <span className="text-xs text-[var(--sd-text)]">Child note</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'rgba(123,200,255,0.8)' }} />
                  <span className="text-xs text-[var(--sd-text)]">Linked note</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-[26px] border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                Outgoing links
              </p>
              {linkedNodes.length > 0 ? (
                linkedNodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => onSelectNote(node.id)}
                    className="rounded-[18px] border border-white/[0.06] bg-black/10 px-4 py-3 text-left transition hover:bg-white/[0.08]"
                  >
                    <span className="block text-sm font-medium text-[var(--sd-text)]">{node.title}</span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-[var(--sd-muted)]">No linked notes.</p>
              )}
            </div>

            <div className="grid gap-3 rounded-[26px] border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                Backlinks
              </p>
              {backlinkNodes.length > 0 ? (
                backlinkNodes.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => onSelectNote(node.id)}
                    className="rounded-[18px] border border-white/[0.06] bg-black/10 px-4 py-3 text-left transition hover:bg-white/[0.08]"
                  >
                    <span className="block text-sm font-medium text-[var(--sd-text)]">{node.title}</span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-[var(--sd-muted)]">No backlinks yet.</p>
              )}
            </div>

            <p className="text-xs leading-5 text-[var(--sd-muted)]">
              Create links by inserting `[[Note Title]]` in a note.
            </p>
          </aside>
        </div>
      </motion.div>
    </div>
  )
}

export default function NoteDock({ authState: initialAuthState, onSetAuthState }: { authState?: AuthState; onSetAuthState?: (state: AuthState) => void }): JSX.Element {
  const {
    notes,
    settings,
    storageInfo,
    selectedNoteId,
    searchQuery,
    isLoading,
    error,
    hydrate,
    createNote,
    deleteNote,
    renameNote,
    updateNoteContent,
    setNoteIcon,
    setNoteColor,
    setNoteImportance,
    setNotePinned,
    setNoteTags,
    setNoteReminderAt,
    setNoteParent,
    selectNote,
    setSearchQuery,
    setDatabasePath
  } = useDockStore()

  const [isHydrated, setIsHydrated] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDatabasePickerOpen, setIsDatabasePickerOpen] = useState(true)
  const [isGraphOpen, setIsGraphOpen] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isMetricsOpen, setIsMetricsOpen] = useState(false)
  const [isMetricsLoading, setIsMetricsLoading] = useState(false)
  const [metrics, setMetrics] = useState<AppMetrics | null>(null)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [isLockConfirmOpen, setIsLockConfirmOpen] = useState(false)
  const [authState, setAuthState] = useState<AuthState | null>(initialAuthState || null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [reminderPopup, setReminderPopup] = useState<ReminderPopup | null>(null)
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set())
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'application' | 'browser'>(loadViewMode)
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    saveViewMode(viewMode)
  }, [viewMode])

  useEffect(() => {
    void hydrate().finally(() => setIsHydrated(true))
  }, [hydrate])

  useEffect(() => {
    async function loadAuthState() {
      try {
        const state = await (window as any).go.main.App.GetAuthStatus()
        setAuthState(state)
        setIsAuthenticated(state.isAuthenticated ?? false)
      } catch (err) {
        console.error('Failed to load auth state:', err)
      }
    }
    void loadAuthState()
  }, [])

  useEffect(() => {
    const resolvedTheme = resolveTheme(settings.theme)
    document.documentElement.dataset.theme = resolvedTheme

    if (settings.theme !== 'system') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const syncTheme = () => {
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light'
    }

    syncTheme()
    media.addEventListener('change', syncTheme)
    return () => media.removeEventListener('change', syncTheme)
  }, [settings.theme])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isMetricsOpen) {
      return
    }

    let cancelled = false
    setIsMetricsLoading(true)
    setMetricsError(null)

    async function loadMetrics() {
      try {
        const appMetrics = await dockApi.getAppMetrics()
        if (!cancelled) {
          setMetrics(appMetrics)
        }
      } catch (error) {
        if (!cancelled) {
          setMetricsError(error instanceof Error ? error.message : 'Failed to load metrics.')
        }
      } finally {
        if (!cancelled) {
          setIsMetricsLoading(false)
        }
      }
    }

    void loadMetrics()

    return () => {
      cancelled = true
    }
  }, [isMetricsOpen])

  // Reload auth state after workspace is selected
  useEffect(() => {
    if (!isDatabasePickerOpen) {
      console.log('[Auth] Workspace selected, reloading auth state...')
      async function reloadAuthState() {
        try {
          const state = await (window as any).go.main.App.GetAuthStatus()
          console.log('[Auth] New workspace auth state:', {
            isLocked: state.isLocked,
            hasPIN: state.hasPIN
          })
          setAuthState(state)
          setIsAuthenticated(false) // Reset authentication when switching workspaces
        } catch (err) {
          console.error('[Auth] Error reloading auth state:', err)
        }
      }
      void reloadAuthState()
    }
  }, [isDatabasePickerOpen])

  useEffect(() => {
    if (!isViewMenuOpen) {
      return
    }

    const handleDismiss = (event: MouseEvent) => {
      if (viewMenuRef.current?.contains(event.target as Node)) {
        return
      }
      setIsViewMenuOpen(false)
    }

    window.addEventListener('mousedown', handleDismiss)

    return () => window.removeEventListener('mousedown', handleDismiss)
  }, [isViewMenuOpen])

  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null
  const normalizedQuery = searchQuery.trim().toLowerCase()

  const visibleNotes = useMemo(() => {
    if (!normalizedQuery) {
      return notes
    }

    return notes.filter((note) => {
      const haystack = [
        note.title,
        stripText(note.content),
        note.tags,
        isImageIcon(note.icon) ? 'image icon' : note.icon,
        importanceLabel(note.importance)
      ].join('\n')
      return haystack.toLowerCase().includes(normalizedQuery)
    })
  }, [notes, normalizedQuery])

  const handleCreateChildNote = async (parentId: string) => {
    const newNoteId = await createNote()
    if (newNoteId) {
      setNoteParent(newNoteId, parentId)
      selectNote(newNoteId)
    }
  }

  const handleSelectNote = (id: string, ctrlKey: boolean) => {
    if (ctrlKey) {
      // Multi-select with Ctrl/Cmd
      setSelectedNoteIds((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(id)) {
          newSet.delete(id)
        } else {
          newSet.add(id)
        }
        return newSet
      })
    } else {
      // Single select
      setSelectedNoteIds(new Set())
      selectNote(id)
    }
  }

  const handleDeleteNote = async (id: string) => {
    await deleteNote(id)
    setSelectedNoteIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    if (selectedNoteIds.size === 0) return
    
    const noteNames = Array.from(selectedNoteIds)
      .map((id) => notes.find((n) => n.id === id)?.title.trim() || 'Untitled')
      .join(', ')
    
    if (
      confirm(
        `Delete ${selectedNoteIds.size} note(s)?\n\n${noteNames}\n\nThis cannot be undone.`
      )
    ) {
      for (const id of selectedNoteIds) {
        await deleteNote(id)
      }
      setSelectedNoteIds(new Set())
    }
  }

  const noteReminderStatus = useMemo(() => {
    const status = new Map<string, { overdue: boolean; dueAt: string }>()

    for (const note of notes) {
      const reminderAt = note.reminderAt.trim()
      if (!reminderAt) {
        continue
      }

      const dueAt = new Date(reminderAt)
      if (Number.isNaN(dueAt.getTime())) {
        continue
      }

      status.set(note.id, {
        overdue: dueAt.getTime() <= now,
        dueAt: reminderAt
      })
    }

    return status
  }, [notes, now])

  const canRenderContent = isHydrated && !isLoading
  const reminderTimersRef = useRef<number[]>([])

  useEffect(() => {
    for (const timer of reminderTimersRef.current) {
      window.clearTimeout(timer)
    }
    reminderTimersRef.current = []

    const now = Date.now()

    for (const note of notes) {
      const reminderAt = note.reminderAt.trim()
      if (!reminderAt) {
        continue
      }

      const dueAt = new Date(reminderAt)
      if (Number.isNaN(dueAt.getTime())) {
        continue
      }

      const timer = window.setTimeout(() => {
        if (hasFiredReminder(note.id, reminderAt)) {
          return
        }

        markReminderFired(note.id, reminderAt)
        const noteTitle = note.title.trim() || 'StickyDock reminder'
        
        // Highlight the note
        setHighlightedNoteId(note.id)
        setTimeout(() => setHighlightedNoteId(null), 8000)
        
        // Play notification sound
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()
        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)
        oscillator.frequency.value = 800
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)
        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.5)
        
        // Announce reminder via text-to-speech
        const utterance = new SpeechSynthesisUtterance(`Reminder: ${noteTitle}`)
        utterance.rate = 1
        utterance.pitch = 1
        utterance.volume = 1
        window.speechSynthesis.speak(utterance)
        
        setReminderPopup({
          id: reminderStorageKey(note.id, reminderAt),
          title: noteTitle,
          body: `Reminder due ${formatReminderDate(reminderAt)}`
        })
      }, Math.max(0, dueAt.getTime() - now))

      reminderTimersRef.current.push(timer)
    }

    return () => {
      for (const timer of reminderTimersRef.current) {
        window.clearTimeout(timer)
      }
    }
  }, [notes])

  useEffect(() => {
    if (!reminderPopup) {
      return
    }

    const timer = window.setTimeout(() => {
      setReminderPopup(null)
    }, 6000)

    return () => window.clearTimeout(timer)
  }, [reminderPopup])

  async function activateDatabase(path: string) {
    const trimmed = path.trim()
    if (!trimmed) {
      return
    }

    await setDatabasePath(trimmed)
    setIsDatabasePickerOpen(false)
  }

  async function openCurrentDatabase() {
    if (!storageInfo?.databasePath) {
      return
    }

    await activateDatabase(storageInfo.databasePath)
  }

  async function openKnownDatabase(path: string) {
    await activateDatabase(path)
  }

  async function browseExistingDatabase() {
    const path = await dockApi.pickDatabaseFile()
    if (!path) {
      return
    }

    await activateDatabase(path)
  }

  async function chooseDatabaseFolder(): Promise<string | null> {
    const folder = await dockApi.pickDatabaseFolder()
    return folder || null
  }

  async function createDatabase(folder: string, fileName: string) {
    await activateDatabase(joinDatabasePath(folder, fileName))
  }

  function handleSwitchDatabase() {
    setIsDatabasePickerOpen(true)
  }

  function handleSelectGraphNote(id: string) {
    selectNote(id)
    setIsGraphOpen(false)
  }

  return (
    <div className="sd-shell flex h-full p-4 text-[var(--sd-text)]">
      {/* Show AuthScreen after workspace selection if app is locked */}
      {!isDatabasePickerOpen && authState?.isLocked && !isAuthenticated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <AuthScreen
            authState={authState}
            onAuthenticated={() => {
              console.log('[Auth] User authenticated via workspace AuthScreen')
              setIsAuthenticated(true)
              setAuthState((prev) => prev ? { ...prev, isAuthenticated: true } : prev)
              // Unlock the database for this session
              void (window as any).go.main.App.UnlockDatabase()
            }}
          />
        </div>
      )}

      <DatabasePickerModal
        isOpen={isDatabasePickerOpen && isHydrated}
        storageInfo={storageInfo}
        onOpenWorkspace={() => openCurrentDatabase()}
        onOpenKnownDatabase={(path) => openKnownDatabase(path)}
        onBrowseExisting={() => browseExistingDatabase()}
        onChooseFolder={() => chooseDatabaseFolder()}
        onCreateDatabase={(folder, fileName) => createDatabase(folder, fileName)}
      />
      <GraphModal
        isOpen={isGraphOpen && isHydrated}
        notes={notes}
        selectedNoteId={selectedNoteId}
        onClose={() => setIsGraphOpen(false)}
        onSelectNote={handleSelectGraphNote}
      />
      <AnimatePresence>
        {isHelpOpen ? (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(5,8,12,0.78)] px-4 py-6 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsHelpOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[800px] overflow-hidden rounded-[34px] border border-white/[0.08] bg-[rgba(11,15,21,0.98)] shadow-[0_32px_110px_rgba(0,0,0,0.5)]"
            >
              <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.34em] text-[var(--sd-muted)]">
                    Documentation
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[var(--sd-text)]">
                    StickyDock Help & Guide
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsHelpOpen(false)}
                  className="rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs text-[var(--sd-text)] transition hover:bg-white/[0.08]"
                >
                  Close
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto p-6 text-sm text-[var(--sd-text)]">
                <div className="space-y-8">
                  {/* Getting Started */}
                  <section>
                    <h3 className="text-lg font-semibold text-[var(--sd-text)] mb-3">📝 Getting Started</h3>
                    <div className="space-y-2 text-[var(--sd-muted)]">
                      <p><strong>Creating Notes:</strong> Click "New note" button to create a note. Changes save automatically - no manual save needed!</p>
                      <p><strong>Search:</strong> Type in the search bar to find notes by title or content instantly.</p>
                      <p><strong>Delete Notes:</strong> Select note and press Delete, or Ctrl+Click multiple notes to delete in bulk.</p>
                      <p><strong>Database/Workspace:</strong> Click ⚙️ Settings to switch to different note databases.</p>
                    </div>
                  </section>

                  {/* Rich Text Editing */}
                  <section>
                    <h3 className="text-lg font-semibold text-[var(--sd-text)] mb-3">✨ Rich Text Editing</h3>
                    <div className="space-y-2 text-[var(--sd-muted)]">
                      <p><strong>Formatting:</strong> Use keyboard shortcuts or click toolbar buttons for:</p>
                      <ul className="ml-4 space-y-1 list-disc">
                        <li><strong>Ctrl+B</strong> = Bold, <strong>Ctrl+I</strong> = Italic, <strong>Ctrl+U</strong> = Underline</li>
                        <li>Strikethrough, Highlight, Code formatting</li>
                      </ul>
                      <p><strong>Slash Commands:</strong> Type <code>/</code> in editor to see 20+ commands:</p>
                      <ul className="ml-4 space-y-1 list-disc">
                        <li>/h1, /h2, /h3 = Headings</li>
                        <li>/table = Insert table</li>
                        <li>/checklist = Task list with checkboxes</li>
                        <li>/quote = Block quote</li>
                        <li>/code = Code block with syntax highlighting</li>
                        <li>/image, /link = Media insertion</li>
                      </ul>
                      <p><strong>Lists:</strong> Use bullet points, numbered lists, or task lists.</p>
                    </div>
                  </section>

                  {/* Voice Features */}
                  <section>
                    <h3 className="text-lg font-semibold text-[var(--sd-text)] mb-3">🎤 Voice Transcription (Speech-to-Text)</h3>
                    <div className="space-y-2 text-[var(--sd-muted)]">
                      <p><strong>How to Transcribe:</strong> Click the 🎤 <strong>Listen</strong> button in the editor toolbar.</p>
                      <ul className="ml-4 space-y-1 list-disc">
                        <li>Speak clearly into your microphone</li>
                        <li>Watch text appear in real-time as you speak</li>
                        <li>Click again to stop transcription</li>
                      </ul>
                      <p><strong>Audio Settings (🎙️):</strong> Click the audio icon to configure:</p>
                      <ul className="ml-4 space-y-1 list-disc">
                        <li><strong>Select Device:</strong> Choose from connected microphones/headsets</li>
                        <li><strong>Test Audio:</strong> Visual level meter shows microphone signal strength</li>
                        <li><strong>Refresh Devices:</strong> Detect newly connected audio inputs</li>
                      </ul>
                      <p><strong>Best Practices:</strong> Test audio first, speak at normal pace, use external microphone for better clarity.</p>
                    </div>
                  </section>

                  {/* Text-to-Speech */}
                  <section>
                    <h3 className="text-lg font-semibold text-[var(--sd-text)] mb-3">🔊 Text-to-Speech (Read Aloud)</h3>
                    <div className="space-y-2 text-[var(--sd-muted)]">
                      <p><strong>How to Listen:</strong> Click the 🔊 <strong>Read</strong> button in the editor toolbar.</p>
                      <ul className="ml-4 space-y-1 list-disc">
                        <li>AI reads your note aloud through speakers/headphones</li>
                        <li>Great for reviewing while working or multitasking</li>
                        <li>Works offline using your OS text-to-speech engine</li>
                      </ul>
                      <p><strong>Use Cases:</strong> Accessibility, proofreading, hands-free review, language learning.</p>
                    </div>
                  </section>

                  {/* Reminders */}
                  <section>
                    <h3 className="text-lg font-semibold text-[var(--sd-text)] mb-3">⏰ Reminder System</h3>
                    <div className="space-y-2 text-[var(--sd-muted)]">
                      <p><strong>Set a Reminder:</strong> Click the ⏰ button in the editor toolbar.</p>
                      <ul className="ml-4 space-y-1 list-disc">
                        <li>Choose date and time for the reminder</li>
                        <li>Save - you'll get notified when time arrives</li>
                      </ul>
                      <p><strong>Notifications Include:</strong></p>
                      <ul className="ml-4 space-y-1 list-disc">
                        <li>🔊 Sound alert</li>
                        <li>🗣️ Voice announcement (AI reads reminder text)</li>
                        <li>📌 Visual notification popup</li>
                      </ul>
                      <p><strong>Perfect For:</strong> Deadlines, recurring tasks, important meetings, follow-ups.</p>
                    </div>
                  </section>

                  {/* Hierarchy */}
                  <section>
                    <h3 className="text-lg font-semibold text-[var(--sd-text)] mb-3">📚 Hierarchical Organization</h3>
                    <div className="space-y-2 text-[var(--sd-muted)]">
                      <p><strong>Organize by Hierarchy:</strong> Create parent-child relationships between notes to build a tree structure.</p>
                      <p><strong>Create Child Notes:</strong></p>
                      <ul className="ml-4 space-y-1 list-disc">
                        <li>Hover over any note in the left sidebar</li>
                        <li>Click the "+" button to add a child note</li>
                        <li>Child notes appear indented under the parent</li>
                      </ul>
                      <p><strong>Expand/Collapse:</strong> Click the arrow next to parent notes to show or hide child notes.</p>
                      <p><strong>Use Cases:</strong> Perfect for chapters under a book, tasks under a project, or sub-topics under a main topic.</p>
                    </div>
                  </section>

                  {/* Connecting Notes */}
                  <section>
                    <h3 className="text-lg font-semibold text-[var(--sd-text)] mb-3">🔗 Connecting Notes (Wiki-Links)</h3>
                    <div className="space-y-2 text-[var(--sd-muted)]">
                      <p><strong>Link Notes Button:</strong> Click "Link Notes" in the editor to create connections between notes visually.</p>
                      <p><strong>How it works:</strong></p>
                      <ul className="ml-4 space-y-1 list-disc">
                        <li>Click "Link Notes" button</li>
                        <li>Search for the note you want to link</li>
                        <li>Click the note to insert the link automatically</li>
                        <li>The wiki-link syntax [[Note Title]] is created</li>
                      </ul>
                      <p><strong>Manual links:</strong> You can also type [[Note Title]] directly to create links.</p>
                      <p><strong>Aliases:</strong> Use [[Note Title|Display Text]] to show custom text for the link.</p>
                      <p><strong>Visual Distinction:</strong> Wiki-links appear as colored badges with link icons, different from external links.</p>
                    </div>
                  </section>

                  {/* Graph View */}
                  <section>
                    <h3 className="text-lg font-semibold text-[var(--sd-text)] mb-3">📊 Interactive Graph Visualization</h3>
                    <div className="space-y-2 text-[var(--sd-muted)]">
                      <p><strong>Visualize Everything:</strong> Click the "Graph" button to see all your notes and relationships in one interactive view.</p>
                      <p><strong>Color-Coded Hierarchy:</strong> Each note type has a unique color:</p>
                      <ul className="ml-4 space-y-1 list-disc">
                        <li>🟢 <strong>Green:</strong> Root notes with children (main topics)</li>
                        <li>🔵 <strong>Teal:</strong> Standalone root notes (no children)</li>
                        <li>🟠 <strong>Orange:</strong> Parent branches (has both parent and children)</li>
                        <li>🟣 <strong>Purple:</strong> Child notes (leaf nodes in hierarchy)</li>
                        <li>🔷 <strong>Blue:</strong> Linked notes (connected via [[...]] wiki-links)</li>
                      </ul>
                      <p><strong>Graph Features:</strong></p>
                      <ul className="ml-4 space-y-1 list-disc">
                        <li>Force-directed layout auto-organizes notes based on connections</li>
                        <li>Search notes to filter the display</li>
                        <li>Click nodes to select and view full details in the sidebar</li>
                        <li>See all outgoing links and backlinks instantly</li>
                        <li>Smooth physics-based animation</li>
                        <li>Color legend in sidebar explains hierarchy at a glance</li>
                      </ul>
                      <p><strong>Hierarchy View:</strong> The graph shows your complete note structure, helping you understand relationships and dependencies.</p>
                    </div>
                  </section>

                  {/* Note Properties */}
                  <section>
                    <h3 className="text-lg font-semibold text-[var(--sd-text)] mb-3">⚙️ Note Properties</h3>
                    <div className="space-y-2 text-[var(--sd-muted)]">
                      <p><strong>Icon:</strong> Set an emoji or symbol to represent your note. Click "Browse" to choose an image.</p>
                      <p><strong>Color:</strong> Customize the note color using the color picker.</p>
                      <p><strong>Priority:</strong> Set note importance (Normal, !, !!, !!!)</p>
                      <p><strong>Tags:</strong> Add comma-separated tags to organize notes by topic.</p>
                      <p><strong>Pinned:</strong> Pin important notes to keep them at the top of your list.</p>
                      <p><strong>Reminder:</strong> Set a reminder date and time for important tasks.</p>
                    </div>
                  </section>

                  {/* Preview Mode */}
                  <section>
                    <h3 className="text-lg font-semibold text-[var(--sd-text)] mb-3">👁️ Preview Mode</h3>
                    <div className="space-y-2 text-[var(--sd-muted)]">
                      <p><strong>Toggle Preview:</strong> Click the "Preview" button in the editor to switch between edit and read modes.</p>
                      <p><strong>Interactive Links:</strong> In preview mode, click wiki-links to navigate to those notes.</p>
                      <p><strong>Formatted View:</strong> See your formatted content with proper styling.</p>
                    </div>
                  </section>

                  {/* Tips & Tricks */}
                  <section>
                    <h3 className="text-lg font-semibold text-[var(--sd-text)] mb-3">💡 Tips & Tricks</h3>
                    <div className="space-y-2 text-[var(--sd-muted)]">
                      <p><strong>Building Knowledge Hierarchies:</strong> Use tree view to organize major topics as root notes, with sub-topics as children.</p>
                      <p><strong>Cross-Linking:</strong> Combine hierarchy (tree view) with wiki-links (graph view) to connect related concepts across different branches.</p>
                      <p><strong>Project Structure:</strong> Create a root note for the project, child notes for tasks, and use wiki-links to connect dependencies.</p>
                      <p><strong>Research Organization:</strong> Organize sources by topic in a tree, then link to your analysis notes to trace references.</p>
                      <p><strong>Use the Graph:</strong> Regularly view the graph to see if notes are isolated or well-connected. Missing connections? Consider linking more!</p>
                      <p><strong>Color Patterns:</strong> Look for clusters of same colors in the graph to identify main topics and branches.</p>
                      <p><strong>Quick Search:</strong> Use the search feature to quickly jump between related notes.</p>
                    </div>
                  </section>

                  {/* Keyboard Shortcuts */}
                  <section>
                    <h3 className="text-lg font-semibold text-[var(--sd-text)] mb-3">⌨️ Keyboard Shortcuts</h3>
                    <div className="space-y-2 text-[var(--sd-muted)]">
                      <p><strong>Cmd/Ctrl + K:</strong> Toggle the command palette in the editor</p>
                      <p><strong>Search Focus:</strong> Click the search bar to filter notes instantly</p>
                      <p><strong>Note Selection:</strong> Click any note in the list to open it</p>
                    </div>
                  </section>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {reminderPopup ? (
        <motion.div
          key={reminderPopup.id}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          className="fixed right-6 top-6 z-50 w-[min(92vw,360px)] rounded-[24px] border border-white/[0.08] bg-[rgba(12,16,22,0.98)] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.42)] ring-1 ring-white/[0.04]"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--sd-accent-soft)] text-sm font-semibold text-[var(--sd-text)]">
              !
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--sd-text)]">{reminderPopup.title}</p>
              <p className="mt-1 text-sm leading-5 text-[var(--sd-muted)]">{reminderPopup.body}</p>
            </div>
            <button
              type="button"
              onClick={() => setReminderPopup(null)}
              className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-[var(--sd-text)] transition hover:bg-white/[0.08]"
              aria-label="Dismiss reminder"
            >
              Dismiss
            </button>
          </div>
        </motion.div>
      ) : null}
      <div className="flex h-full w-full overflow-hidden rounded-[34px] bg-[var(--sd-panel)] shadow-[0_28px_90px_rgba(0,0,0,0.38)] ring-1 ring-white/[0.04] flex-col">
        {/* VSCode-Style Toolbar */}
        <div className="flex h-12 shrink-0 items-center justify-center border-b border-white/[0.06] bg-[rgba(11,15,21,0.6)] px-3 backdrop-blur-sm">
          <div className="flex w-full max-w-[min(95vw,1300px)] items-center gap-2">
            <div className="flex items-center gap-1">
              <p className="text-sm font-semibold tracking-[-0.02em] text-[var(--sd-text)] mr-2">StickyDock</p>
            </div>
            
            {/* Toolbar Separator */}
            <div className="h-6 w-px bg-white/[0.08]" />
            
            {/* Toolbar Buttons */}
            <div className="flex gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsViewMenuOpen((value) => !value)}
                className={['group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition',
                  viewMode === 'browser'
                    ? 'border border-[var(--sd-accent)] bg-[var(--sd-accent-soft)] text-[var(--sd-text)]'
                    : 'border border-white/[0.08] bg-white/[0.04] text-[var(--sd-text)] hover:bg-white/[0.08]'
                ].join(' ')}
                aria-label="Switch application and browser view"
                title="View Mode"
              >
                <span className="text-lg">🌐</span>
                <span className="hidden text-[11px] font-medium text-[var(--sd-muted)] sm:inline">{viewMode === 'application' ? 'App' : 'Browser'}</span>
              </button>

              {isViewMenuOpen ? (
                <div
                  ref={viewMenuRef}
                  onMouseDown={(event) => event.stopPropagation()}
                  className="absolute right-0 mt-2 w-52 rounded-2xl border border-white/[0.08] bg-[rgba(7,10,15,0.96)] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('application')
                      setIsViewMenuOpen(false)
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-[var(--sd-text)] transition hover:bg-white/[0.08]"
                  >
                    <span>Application view</span>
                    {viewMode === 'application' ? <span>✓</span> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('browser')
                      setIsViewMenuOpen(false)
                      openExternalUrl(window.location.href)
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-[var(--sd-text)] transition hover:bg-white/[0.08]"
                  >
                    <span>View in browser</span>
                    {viewMode === 'browser' ? <span>✓</span> : null}
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setIsGraphOpen(true)}
              className="group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/[0.08]"
              aria-label="View graph"
              title="Graph Visualization (📊)"
            >
              <span className="text-lg">📊</span>
              <span className="hidden text-[11px] font-medium text-[var(--sd-muted)] sm:inline">Graph</span>
            </button>

            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              className="group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/[0.08]"
              aria-label="Help & Documentation"
              title="Help & Documentation (❓)"
            >
              <span className="text-lg">❓</span>
              <span className="hidden text-[11px] font-medium text-[var(--sd-muted)] sm:inline">Help</span>
            </button>

            <button
              type="button"
              onClick={() => setIsMetricsOpen(true)}
              className="group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/[0.08]"
              aria-label="View memory and database stats"
              title="Stats (🧠)"
            >
              <span className="text-lg">🧠</span>
              <span className="hidden text-[11px] font-medium text-[var(--sd-muted)] sm:inline">Stats</span>
            </button>

            <button
              type="button"
              onClick={() => setIsLockConfirmOpen(true)}
              className="group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/[0.08]"
              aria-label="Lock Notes"
              title="Lock Notes (🔒)"
            >
              <span className="text-lg">🔒</span>
              <span className="hidden text-[11px] font-medium text-[var(--sd-muted)] sm:inline">Lock</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-white/[0.08]"
              aria-label="Settings"
              title="Settings (⚙️)"
            >
              <span className="text-lg">⚙️</span>
              <span className="hidden text-[11px] font-medium text-[var(--sd-muted)] sm:inline">Settings</span>
            </button>
          </div>
        </div>
      </div>

        {/* Main Content Container */}
        <div className="flex h-full w-full overflow-hidden flex-1">
        <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-white/[0.05] bg-[rgba(13,18,25,0.8)] px-4 py-4">
          {/* Sidebar Header */}
          <div className="mb-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--sd-accent)]">Explorer</p>
            <p className="mt-1 text-xs text-[var(--sd-muted)]">{notes.length} {notes.length === 1 ? 'note' : 'notes'}</p>
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <label className="sr-only" htmlFor="note-search">
              Search notes
            </label>
            <div className="relative group">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[var(--sd-muted)] group-focus-within:text-[var(--sd-accent)] transition">
                🔍
              </span>
              <input
                id="note-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Find notes..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.05] text-sm text-[var(--sd-text)] outline-none placeholder:text-[var(--sd-muted)] focus:border-[var(--sd-accent)] focus:bg-white/[0.08] transition"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => void createNote()}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[var(--sd-accent)] hover:bg-[var(--sd-accent)]/90 px-4 py-3 text-sm font-semibold text-[var(--sd-accent-contrast)] transition-all duration-200 shadow-lg shadow-[var(--sd-accent)]/20 hover:shadow-[var(--sd-accent)]/40 hover:scale-105"
            >
              <span className="text-lg">✨</span>
              New Note
            </button>
            {selectedNoteIds.size > 0 && (
              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-[rgba(255,110,129,0.4)] bg-[rgba(255,110,129,0.08)] hover:bg-[rgba(255,110,129,0.16)] px-3 py-3 text-sm font-medium text-[var(--sd-danger)] transition-all duration-200"
              >
                <span>🗑️</span>
                <span className="hidden sm:inline">({selectedNoteIds.size})</span>
              </button>
            )}
          </div>

          {/* Notes List */}
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {notes.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] px-6 py-10 text-center border border-white/[0.06]">
                <p className="text-4xl mb-3">📝</p>
                <p className="text-sm font-semibold text-[var(--sd-text)]">No notes yet</p>
                <p className="mt-2 text-xs leading-5 text-[var(--sd-muted)]">
                  Click "New Note" to create your first note
                </p>
              </div>
            ) : visibleNotes.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] px-6 py-10 text-center border border-white/[0.06]">
                <p className="text-4xl mb-3">🔍</p>
                <p className="text-sm font-semibold text-[var(--sd-text)]">No matches found</p>
                <p className="mt-2 text-xs leading-5 text-[var(--sd-muted)]">
                  Try different search terms
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <NoteTreeView
                  notes={visibleNotes}
                  selectedNoteId={selectedNoteId}
                  highlightedNoteId={highlightedNoteId}
                  onSelectNote={(id, ctrlKey) => handleSelectNote(id, ctrlKey ?? false)}
                  onCreateChildNote={handleCreateChildNote}
                  stripText={stripText}
                  noteGlyph={noteGlyph}
                  isImageIcon={isImageIcon}
                />
              </div>
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/[0.05] pt-3 text-[10px] uppercase tracking-[0.16em] text-[var(--sd-muted)]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--sd-accent)]"></span>
              Ready
            </span>
            <span>{selectedNoteIds.size > 0 && `${selectedNoteIds.size} selected`}</span>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {canRenderContent && selectedNote ? (
            <NoteEditor
              key={selectedNote.id}
              note={selectedNote}
              allNotes={notes}
              onDelete={(id) => void handleDeleteNote(id)}
              onTitleChange={(id, title) => renameNote(id, title)}
              onContentChange={(id, content) => updateNoteContent(id, content)}
              onIconChange={(id, icon) => setNoteIcon(id, icon)}
              onColorChange={(id, color) => setNoteColor(id, color)}
              onImportanceChange={(id, importance) => setNoteImportance(id, importance)}
              onPinnedChange={(id, pinned) => setNotePinned(id, pinned)}
              onTagsChange={(id, tags) => setNoteTags(id, tags)}
              onReminderChange={(id, reminderAt) => setNoteReminderAt(id, reminderAt)}
              onOpenNoteByTitle={(title) => {
                const targetNote = notes.find(
                  (n) => n.title.toLowerCase() === title.toLowerCase()
                )
                if (targetNote) {
                  selectNote(targetNote.id)
                }
              }}
            />
          ) : canRenderContent ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-md rounded-[32px] bg-white/[0.03] p-10 text-center shadow-[0_16px_45px_rgba(0,0,0,0.18)]">
                <p className="text-[11px] uppercase tracking-[0.32em] text-[var(--sd-muted)]">
                  StickyDock
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--sd-text)]">
                  A focused place for writing.
                </h2>
                <p className="mt-4 text-sm leading-6 text-[var(--sd-muted)]">
                  Create a note from the sidebar. The editor stays calm and centered on content.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-[30px] border border-white/[0.05] bg-[rgba(8,12,17,0.5)] text-sm text-[var(--sd-muted)]">
              Loading notes...
            </div>
          )}
        </main>
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={settings.theme}
        onSwitchDatabase={handleSwitchDatabase}
      />

      <AnimatePresence>
        {isMetricsOpen ? (
          <MetricsModal
            isOpen={isMetricsOpen}
            isLoading={isMetricsLoading}
            metrics={metrics}
            error={metricsError}
            onClose={() => setIsMetricsOpen(false)}
            onRefresh={async () => {
              setIsMetricsLoading(true)
              setMetricsError(null)
              try {
                const appMetrics = await dockApi.getAppMetrics()
                setMetrics(appMetrics)
              } catch (error) {
                setMetricsError(error instanceof Error ? error.message : 'Failed to load metrics.')
              } finally {
                setIsMetricsLoading(false)
              }
            }}
          />
        ) : null}
      </AnimatePresence>

      {authState && (
        <LockConfirmModal
          isOpen={isLockConfirmOpen}
          authState={authState}
          onClose={() => setIsLockConfirmOpen(false)}
          onLocked={() => {
            setIsLockConfirmOpen(false)
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}
