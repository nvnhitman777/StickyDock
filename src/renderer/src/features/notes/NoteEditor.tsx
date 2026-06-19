import { AnimatePresence, motion } from 'framer-motion'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { markInputRule, markPasteRule, Mark, mergeAttributes } from '@tiptap/core'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import type { Note } from '@/types/domain'

type EditorCommand = {
  id: string
  label: string
  description: string
  keywords: string[]
  run: (editor: Editor) => void
}

type CommandPaletteState = {
  open: boolean
  query: string
  source: 'shortcut' | 'slash'
  range: { from: number; to: number } | null
  anchor: { left: number; top: number } | null
}

type NoteLinkPickerState = {
  open: boolean
  query: string
}

type NoteEditorProps = {
  note: Note
  allNotes: Note[]
  onDelete: (id: string) => void
  onTitleChange: (id: string, title: string) => void
  onContentChange: (id: string, content: string) => void
  onIconChange: (id: string, icon: string) => void
  onColorChange: (id: string, color: string) => void
  onImportanceChange: (id: string, importance: number) => void
  onPinnedChange: (id: string, pinned: boolean) => void
  onTagsChange: (id: string, tags: string) => void
  onReminderChange: (id: string, reminderAt: string) => void
  onOpenNoteByTitle: (title: string) => void
}

const priorityLevels = [
  { value: 0, label: 'Normal' },
  { value: 1, label: '!' },
  { value: 2, label: '!!' },
  { value: 3, label: '!!!' }
]

function formatDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Just now'
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(parsed)
}

function normalizeTags(value: string): string {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(', ')
}

function openExternalUrl(url: string) {
  if (window.runtime?.BrowserOpenURL) {
    window.runtime.BrowserOpenURL(url)
  }
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

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'))
    reader.readAsDataURL(file)
  })
}

function fuzzyIncludes(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

function getPalettePosition(
  anchor: { left: number; top: number } | null
): { left: number; top: number } {
  if (!anchor) {
    return {
      left: Math.max(16, Math.round(window.innerWidth / 2) - 320),
      top: Math.max(24, Math.round(window.innerHeight / 2) - 220)
    }
  }

  const width = 640
  const height = 520

  return {
    left: Math.max(16, Math.min(Math.round(anchor.left), window.innerWidth - width - 16)),
    top: Math.max(16, Math.min(Math.round(anchor.top), window.innerHeight - height - 16))
  }
}

function isImageIcon(value: string): boolean {
  return value.startsWith('data:image/')
}

function iconLabel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return 'o'
  }

  return trimmed
}

const wikiLinkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

const WikiLink = Mark.create({
  name: 'wikiLink',

  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'sd-wiki-link'
      }
    }
  },

  addAttributes() {
    return {
      title: {
        default: ''
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-wiki-link]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false
          }

          return {
            title: element.dataset.wikiLink ?? element.textContent?.trim() ?? ''
          }
        }
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const title = String(HTMLAttributes.title ?? '').trim()
    if (!title) {
      return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
    }

    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        title,
        'data-wiki-link': title,
        style: 'cursor: pointer; user-select: none;'
      }),
      0
    ]
  },

  addInputRules() {
    return [
      markInputRule({
        find: wikiLinkPattern,
        type: this.type,
        getAttributes: (match) => ({
          title: (match[1] ?? '').trim()
        })
      })
    ]
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: wikiLinkPattern,
        type: this.type,
        getAttributes: (match) => ({
          title: (match[1] ?? '').trim()
        })
      })
    ]
  }
})

function NoteLinkPicker({
  isOpen,
  query,
  notes,
  onQueryChange,
  onClose,
  onPick
}: {
  isOpen: boolean
  query: string
  notes: Note[]
  onQueryChange: (value: string) => void
  onClose: () => void
  onPick: (title: string) => void
}): JSX.Element | null {
  const filteredNotes = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return notes
    }

    return notes.filter((item) => {
      const haystack = [item.title, item.tags, item.content]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalized)
    })
  }, [notes, query])

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const first = filteredNotes[0]
      if (first) {
        onPick(first.title.trim() || 'Untitled note')
        return
      }

      const fallback = query.trim()
      if (fallback) {
        onPick(fallback)
      }
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="absolute left-1/2 top-1/2 w-[min(92vw,760px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] border border-white/[0.08] bg-[rgba(12,16,22,0.98)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <span className="text-sm text-[var(--sd-muted)]">[[</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes to link"
            className="w-full border-0 bg-transparent text-sm text-[var(--sd-text)] outline-none placeholder:text-[var(--sd-muted)]"
            autoFocus
          />
          <kbd className="rounded-full bg-white/[0.05] px-2 py-1 text-[11px] text-[var(--sd-muted)]">
            Esc
          </kbd>
        </div>

        <div className="max-h-[56vh] overflow-y-auto p-2">
          {filteredNotes.length > 0 ? (
            <div className="grid gap-1">
              {filteredNotes.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onPick(item.title.trim() || 'Untitled note')}
                  className="flex items-start justify-between gap-4 rounded-[20px] px-4 py-3 text-left transition hover:bg-white/[0.06]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--sd-text)]">
                      {item.title.trim() || 'Untitled note'}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--sd-muted)]">
                      {item.tags.trim() || 'No tags'}
                    </p>
                  </div>
                  <span className="rounded-full bg-white/[0.05] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                    Link
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 px-3 py-6 text-center">
              <p className="text-sm text-[var(--sd-muted)]">No matching notes.</p>
              <button
                type="button"
                onClick={() => {
                  const fallback = query.trim()
                  if (fallback) {
                    onPick(fallback)
                  }
                }}
                disabled={!query.trim()}
                className="mx-auto rounded-full bg-[var(--sd-accent)] px-4 py-2 text-sm font-medium text-[var(--sd-accent-contrast)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Link to "{query.trim() || 'title'}"
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function NoteEditor({
  note,
  allNotes,
  onDelete,
  onTitleChange,
  onContentChange,
  onIconChange,
  onColorChange,
  onImportanceChange,
  onPinnedChange,
  onTagsChange,
  onReminderChange,
  onOpenNoteByTitle
}: NoteEditorProps): JSX.Element {
  const editorRef = useRef<Editor | null>(null)
  const previewContainerRef = useRef<HTMLDivElement | null>(null)
  const paletteInputRef = useRef<HTMLInputElement | null>(null)
  const iconInputRef = useRef<HTMLInputElement | null>(null)
  const [isInspectorOpen, setIsInspectorOpen] = useState(false)
  const [isPreviewMode, setIsPreviewMode] = useState(false)
  const [isLinkPickerOpen, setIsLinkPickerOpen] = useState(false)
  const [linkPickerQuery, setLinkPickerQuery] = useState('')
  const [isLinkNotesModalOpen, setIsLinkNotesModalOpen] = useState(false)
  const [linkNotesSearch, setLinkNotesSearch] = useState('')
  const [isTableDialogOpen, setIsTableDialogOpen] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [tableHeaderRow, setTableHeaderRow] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isMicInfoOpen, setIsMicInfoOpen] = useState(false)
  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('')
  const [isTesting, setIsTesting] = useState(false)
  const [testAudioLevel, setTestAudioLevel] = useState(0)
  const speechRecognitionRef = useRef<any>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const testingStreamRef = useRef<MediaStream | null>(null)
  const testingRef = useRef(false)
  const [paletteState, setPaletteState] = useState<CommandPaletteState>({
    open: false,
    query: '',
    source: 'shortcut',
    range: null,
    anchor: null
  })

  const closePalette = () =>
    setPaletteState({ open: false, query: '', source: 'shortcut', range: null, anchor: null })

  const openShortcutPalette = () =>
    setPaletteState({ open: true, query: '', source: 'shortcut', range: null, anchor: null })

  const insertLink = (editor: Editor) => {
    const value = window.prompt('Link URL')
    if (!value) {
      return
    }

    const href = value.trim()
    if (!href) {
      return
    }

    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent(href).setLink({ href }).run()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }

  const openNoteLinkPicker = (editor: Editor) => {
    const selectedText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      '\n'
    ).trim()
    setLinkPickerQuery(selectedText || note.title.trim())
    setIsLinkPickerOpen(true)
  }

  const insertNoteLink = (editor: Editor, targetTitle: string) => {
    const title = targetTitle.trim()
    if (!title) {
      return
    }

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'text',
        text: title,
        marks: [
          {
            type: 'wikiLink',
            attrs: { title }
          }
        ]
      })
      .run()
  }

  const handlePickWikiLink = (title: string) => {
    const editorInstance = editorRef.current
    if (!editorInstance) {
      return
    }

    insertNoteLink(editorInstance, title)
    setIsLinkPickerOpen(false)
  }

  const handleLinkNoteFromModal = (targetNote: Note) => {
    const editorInstance = editorRef.current
    if (!editorInstance) {
      return
    }

    insertNoteLink(editorInstance, targetNote.title)
    setIsLinkNotesModalOpen(false)
    setLinkNotesSearch('')
  }

  async function handleIconBrowse(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !file.type.startsWith('image/')) {
      return
    }

    const dataUrl = await readFileAsDataUrl(file)
    if (dataUrl) {
      onIconChange(note.id, dataUrl)
    }
  }

  const toggleSpeechRecognition = () => {
    console.log('[Speech] toggleSpeechRecognition called, isListening:', isListening)
    
    const SpeechRecognition = window.webkitSpeechRecognition || (window as any).SpeechRecognition
    
    if (!SpeechRecognition) {
      alert('Speech recognition not supported in this browser')
      return
    }

    if (isListening) {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop()
      }
      setIsListening(false)
      return
    }

    // Request access from selected device first
    const startRecognition = () => {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      
      let finalResults: string[] = []
      let sessionStarted = false

      recognition.onstart = () => {
        console.log('[Speech] Recognition started')
        setIsListening(true)
        finalResults = []
        sessionStarted = false
      }

      recognition.onresult = (event: any) => {
        console.log('[Speech] Result event:', {
          resultIndex: event.resultIndex,
          resultsLength: event.results.length,
          isFinal: event.results[event.results.length - 1]?.isFinal
        })
        
        let interimTranscript = ''
        let hasFinalResult = false

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          console.log(`[Speech]   Result ${i}: "${transcript}" (isFinal: ${event.results[i].isFinal})`)
          if (event.results[i].isFinal) {
            finalResults.push(transcript)
            hasFinalResult = true
          } else {
            interimTranscript += transcript
          }
        }

        console.log('[Speech] hasFinalResult:', hasFinalResult, 'finalResults:', finalResults)

        // Only update editor when there are final results
        if (hasFinalResult) {
          const editorInstance = editorRef.current
          console.log('[Speech] Editor instance:', !!editorInstance, 'sessionStarted:', sessionStarted)
          
          if (editorInstance && !sessionStarted) {
            const timestamp = new Date().toLocaleTimeString()
            const text = `\n**🎤 Audio Input** - ${timestamp}\n${finalResults.join(' ')}\n`
            console.log('[Speech] Inserting text:', text)
            editorInstance.chain().focus('end').insertContent(text).run()
            // Manually trigger save after inserting transcription
            const newContent = editorInstance.getHTML()
            console.log('[Speech] Notifying content change, new content length:', newContent.length)
            onContentChange(note.id, newContent)
            sessionStarted = true
            finalResults = []
          } else if (editorInstance && sessionStarted) {
            // Append to existing session if still recording
            const lastNode = editorInstance.state.doc.content.content[editorInstance.state.doc.content.content.length - 1]
            console.log('[Speech] Last node contains Audio Input:', lastNode?.textContent.includes('Audio Input'))
            if (lastNode && lastNode.textContent.includes('Audio Input')) {
              // Continue the same session
              const appendText = finalResults.join(' ') + ' '
              console.log('[Speech] Appending text:', appendText)
              editorInstance.chain().focus('end').insertContent(appendText).run()
              // Manually trigger save after appending transcription
              const newContent = editorInstance.getHTML()
              console.log('[Speech] Notifying content change after append, new content length:', newContent.length)
              onContentChange(note.id, newContent)
              finalResults = []
            }
          }
        }
      }

      recognition.onerror = (event: any) => {
        console.error('[Speech] Error:', event.error)
        const errorMsg = event.error
        if (errorMsg === 'network') {
          console.warn('Speech recognition: Network error (may still work)')
        } else if (errorMsg === 'no-speech') {
          console.warn('Speech recognition: No speech detected')
        } else if (errorMsg !== 'aborted') {
          console.error('Speech recognition error:', errorMsg)
        }
      }

      recognition.onend = () => {
        console.log('[Speech] Recognition ended')
        setIsListening(false)
      }

      speechRecognitionRef.current = recognition
      try {
        console.log('[Speech] Starting recognition')
        recognition.start()
      } catch (err) {
        console.error('Failed to start recognition:', err)
        setIsListening(false)
      }
    }

    // Try to request access from selected device
    if (selectedAudioDeviceId && audioDevices.length > 0) {
      navigator.mediaDevices
        .getUserMedia({ audio: { deviceId: { exact: selectedAudioDeviceId } } })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop())
          console.log(`Using audio device: ${audioDevices.find(d => d.deviceId === selectedAudioDeviceId)?.label || 'Selected'}`)
          startRecognition()
        })
        .catch((err) => {
          console.warn('Selected device unavailable, trying default microphone:', err.message)
          // Fallback to default
          navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then((stream) => {
              stream.getTracks().forEach((track) => track.stop())
              startRecognition()
            })
            .catch((err2) => {
              console.error('No microphone access available:', err2.message)
              alert('No microphone access. Please grant microphone permission in browser settings.')
            })
        })
    } else if (audioDevices.length === 0) {
      console.warn('No audio devices detected, using default microphone')
      startRecognition()
    } else {
      startRecognition()
    }
  }

  const toggleTextToSpeech = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }

    const stripedText = stripText(note.content)
    if (!stripedText) {
      return
    }

    const utterance = new SpeechSynthesisUtterance(stripedText)
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1

    utterance.onstart = () => {
      setIsSpeaking(true)
    }

    utterance.onend = () => {
      setIsSpeaking(false)
    }

    utterance.onerror = () => {
      setIsSpeaking(false)
    }

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  const loadAudioDevices = async () => {
    try {
      // Request microphone permission first to get labeled devices
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
      } catch (err: any) {
        console.warn('[Audio] Permission request failed:', err.name)
      }

      // Enumerate all audio input devices
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter((device) => device.kind === 'audioinput')
      
      if (audioInputs.length > 0) {
        setAudioDevices(audioInputs)
        
        // Prefer "Default" labeled device if available
        const defaultLabeled = audioInputs.find(d => d.label.toLowerCase().includes('default'))
        const defaultDevice = defaultLabeled || audioInputs[0]
        
        if (!selectedAudioDeviceId) {
          setSelectedAudioDeviceId(defaultDevice.deviceId)
        }
      } else {
        // Try fallback - create virtual default device
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          fallbackStream.getTracks().forEach(track => track.stop())
          
          const defaultDevice: MediaDeviceInfo = {
            deviceId: 'default',
            kind: 'audioinput',
            label: 'Default Microphone',
            groupId: ''
          } as any
          
          setAudioDevices([defaultDevice])
          setSelectedAudioDeviceId('default')
        } catch (fallbackErr) {
          console.warn('[Audio] No audio devices available')
          setAudioDevices([])
        }
      }
    } catch (error: any) {
      console.error('[Audio] Failed to load devices:', error.message)
    }
  }

  const testAudioInput = async () => {
    if (testingRef.current) {
      // Stop testing
      console.log('[Audio Test] Stopping test...')
      testingRef.current = false
      if (testingStreamRef.current) {
        testingStreamRef.current.getTracks().forEach((track) => {
          track.stop()
          console.log('[Audio Test] Stopped track:', track.kind)
        })
        testingStreamRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      setIsTesting(false)
      setTestAudioLevel(0)
      return
    }

    try {
      console.log('[Audio Test] Starting audio test...')
      console.log('[Audio Test] Selected device:', selectedAudioDeviceId)
      testingRef.current = true
      setIsTesting(true)
      
      // Build constraints based on selected device
      let constraints: any = { audio: true }
      if (selectedAudioDeviceId && selectedAudioDeviceId !== 'default') {
        constraints.audio = { deviceId: { exact: selectedAudioDeviceId } }
      }
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      testingStreamRef.current = stream

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextRef.current = audioContext
      
      const analyser = audioContext.createAnalyser()
      analyserRef.current = analyser
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8

      // Try createMediaStreamAudioSource first, fall back to createMediaStreamSource
      let source
      if (typeof audioContext.createMediaStreamAudioSource === 'function') {
        source = audioContext.createMediaStreamAudioSource(stream)
      } else if (typeof audioContext.createMediaStreamSource === 'function') {
        source = audioContext.createMediaStreamSource(stream)
      } else {
        throw new Error('No media stream audio source available')
      }
      
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      let frameCount = 0
      let maxLevel = 0
      const updateLevel = () => {
        if (!testingRef.current) {
          return
        }
        
        frameCount++
        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        const level = Math.min(100, Math.round(average / 2.55))
        maxLevel = Math.max(maxLevel, level)
        
        setTestAudioLevel(level)
        requestAnimationFrame(updateLevel)
      }

      updateLevel()

      // Auto-stop after 30 seconds
      setTimeout(() => {
        if (testingRef.current && testingStreamRef.current) {
          testingRef.current = false
          testingStreamRef.current.getTracks().forEach((track) => track.stop())
          testingStreamRef.current = null
        }
        if (audioContextRef.current) {
          audioContextRef.current.close()
          audioContextRef.current = null
        }
        setIsTesting(false)
        setTestAudioLevel(0)
      }, 30000)
    } catch (error: any) {
      console.error('[Audio Test] Error:', error.name || error.message)
      testingRef.current = false
      setIsTesting(false)
      setTestAudioLevel(0)
    }
  }

  const commands = useMemo<EditorCommand[]>(
    () => [
      {
        id: 'heading-1',
        label: 'Heading',
        description: 'Large section heading',
        keywords: ['heading', 'title', 'h1'],
        run: (target) => target.chain().focus().toggleHeading({ level: 1 }).run()
      },
      {
        id: 'checklist',
        label: 'Checklist',
        description: 'Task list with checkboxes',
        keywords: ['checklist', 'task', 'todo'],
        run: (target) => target.chain().focus().toggleTaskList().run()
      },
      {
        id: 'bullet-list',
        label: 'Bullet List',
        description: 'Bulleted list',
        keywords: ['bullet', 'list', 'points'],
        run: (target) => target.chain().focus().toggleBulletList().run()
      },
      {
        id: 'numbered-list',
        label: 'Numbered List',
        description: 'Ordered list',
        keywords: ['numbered', 'ordered', 'list'],
        run: (target) => target.chain().focus().toggleOrderedList().run()
      },
      {
        id: 'quote',
        label: 'Quote',
        description: 'Indented quote block',
        keywords: ['quote', 'blockquote'],
        run: (target) => target.chain().focus().toggleBlockquote().run()
      },
      {
        id: 'divider',
        label: 'Divider',
        description: 'Horizontal rule',
        keywords: ['divider', 'rule', 'separator'],
        run: (target) => target.chain().focus().setHorizontalRule().run()
      },
      {
        id: 'code-block',
        label: 'Code Block',
        description: 'Monospace block',
        keywords: ['code', 'snippet', 'block'],
        run: (target) => target.chain().focus().toggleCodeBlock().run()
      },
      {
        id: 'table',
        label: 'Table',
        description: '3 by 3 table',
        keywords: ['table', 'grid', 'rows'],
        run: (target) => target.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      },
      {
        id: 'image',
        label: 'Image',
        description: 'Insert from URL',
        keywords: ['image', 'media', 'photo'],
        run: () => {
          const editorInstance = editorRef.current
          if (!editorInstance) {
            return
          }

          const value = window.prompt('Image URL')
          const src = value?.trim()
          if (src) {
            editorInstance.chain().focus().setImage({ src, alt: 'image' }).run()
          }
        }
      },
      {
        id: 'callout',
        label: 'Callout',
        description: 'Highlighted note block',
        keywords: ['callout', 'note', 'info'],
        run: (target) => target.chain().focus().toggleBlockquote().insertContent(' Callout').run()
      },
      {
        id: 'link',
        label: 'Link',
        description: 'Wrap selection or insert URL',
        keywords: ['link', 'url', 'hyperlink'],
        run: () => {
          const editorInstance = editorRef.current
          if (!editorInstance) {
            return
          }

          insertLink(editorInstance)
        }
      },
      {
        id: 'note-link',
        label: 'Note Link',
        description: 'Connect to another note',
        keywords: ['note', 'wiki', 'graph', 'link'],
        run: (target) => openNoteLinkPicker(target)
      },
      {
        id: 'emoji',
        label: 'Emoji',
        description: 'Insert a symbol',
        keywords: ['emoji', 'icon', 'symbol'],
        run: (target) => target.chain().focus().insertContent('✨').run()
      },
      {
        id: 'date',
        label: 'Date',
        description: "Insert today's date",
        keywords: ['date', 'time', 'today'],
        run: (target) =>
          target
            .chain()
            .focus()
            .insertContent(new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date()))
            .run()
      }
    ],
    [allNotes, insertLink, note.title, openNoteLinkPicker]
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: {
          HTMLAttributes: {
            class: 'sd-code-block'
          }
        },
        blockquote: {
          HTMLAttributes: {
            class: 'sd-blockquote'
          }
        }
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({
        autolink: true,
        defaultProtocol: 'https',
        linkOnPaste: true,
        openOnClick: false,
        HTMLAttributes: {
          class: 'sd-link'
        }
      }),
      Image.configure({
        allowBase64: true,
        HTMLAttributes: {
          class: 'sd-image'
        }
      }),
      Placeholder.configure({
        placeholder: 'Start writing or type / for commands'
      }),
      WikiLink,
      TaskList.configure({
        HTMLAttributes: {
          class: 'sd-task-list'
        }
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'sd-task-item'
        }
      }),
      Table.configure({
        resizable: true
      }),
      TableRow,
      TableHeader,
      TableCell
    ],
    content: note.content || '<p></p>',
    editorProps: {
      attributes: {
        class: 'sd-editor-content'
      },
      handleTextInput: (view, _from, _to, text) => {
        if (text !== '/') {
          return false
        }

        const { $from } = view.state.selection
        const beforeCursor = $from.parent.textBetween(0, $from.parentOffset, undefined, '\uFFFC')
        if (beforeCursor.trim().length !== 0) {
          return false
        }

        const coords = view.coordsAtPos(view.state.selection.from)
        setPaletteState({
          open: true,
          query: '',
          source: 'slash',
          range: { from: view.state.selection.from, to: view.state.selection.from },
          anchor: {
            left: coords.left,
            top: coords.bottom + 12
          }
        })

        requestAnimationFrame(() => paletteInputRef.current?.focus())
        return true
      },
      handlePaste: (_view, event) => {
        const clipboardEvent = event as ClipboardEvent
        const items = Array.from(clipboardEvent.clipboardData?.items ?? [])
        const files = Array.from(clipboardEvent.clipboardData?.files ?? [])
        const imageFile =
          files.find(isImageFile) ??
          items
            .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
            .find((file): file is File => file !== null && isImageFile(file))

        if (!imageFile) {
          return false
        }

        clipboardEvent.preventDefault()
        void insertImageFile(imageFile)
        return true
      },
      handleDrop: (_view, event) => {
        const dragEvent = event as DragEvent
        const files = Array.from(dragEvent.dataTransfer?.files ?? [])
        const imageFile = files.find(isImageFile)
        if (!imageFile) {
          return false
        }

        dragEvent.preventDefault()
        void insertImageFile(imageFile)
        return true
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault()
          openShortcutPalette()
          requestAnimationFrame(() => paletteInputRef.current?.focus())
          return true
        }

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
          event.preventDefault()
          editorRef.current?.chain().focus().toggleBold().run()
          return true
        }

        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
          event.preventDefault()
          editorRef.current?.chain().focus().toggleItalic().run()
          return true
        }

        return false
      }
    },
    onCreate: ({ editor }) => {
      editorRef.current = editor
    },
    onSelectionUpdate: ({ editor }) => {
      editorRef.current = editor
    },
    onUpdate: ({ editor }) => {
      editorRef.current = editor
      onContentChange(note.id, editor.getHTML())
    }
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    editor.commands.setContent(note.content || '<p></p>', { emitUpdate: false })
  }, [editor, note.id])

  useEffect(() => {
    if (!editor) {
      return
    }

    editor.setEditable(!isPreviewMode)
  }, [editor, isPreviewMode])

  useEffect(() => {
    if (!editor) {
      return
    }

    const getAnchorTarget = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      return target?.closest('a[data-wiki-link], a.sd-link') as HTMLAnchorElement | null
    }

    const handleModifiedLinkInteraction = (event: MouseEvent) => {
      const anchor = getAnchorTarget(event)
      if (!anchor) {
        return
      }

      const wikiTitle = anchor.dataset.wikiLink?.trim()
      const isWikiLink = Boolean(wikiTitle)
      const isPrimaryModifiedClick =
        event.type === 'mousedown' && event.button === 0 && (event.ctrlKey || event.metaKey)
      const isMiddleClick = event.type === 'auxclick' && event.button === 1
      const shouldOpenWiki = isWikiLink && (isPrimaryModifiedClick || isMiddleClick)

      if (shouldOpenWiki && wikiTitle) {
        event.preventDefault()
        event.stopPropagation()
        onOpenNoteByTitle(wikiTitle)
        return
      }

      if (!isWikiLink && (isPrimaryModifiedClick || isMiddleClick)) {
        event.preventDefault()
        event.stopPropagation()
        openExternalUrl(anchor.href)
      }
    }

    const handleLinkClick = (event: MouseEvent) => {
      const anchor = getAnchorTarget(event)
      if (!anchor) {
        return
      }

      if (anchor.dataset.wikiLink) {
        if (!editor.isEditable) {
          event.preventDefault()
          event.stopPropagation()
          onOpenNoteByTitle(anchor.dataset.wikiLink.trim())
        } else if (!(event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          event.stopPropagation()
        }
        return
      }

      if (!editor.isEditable) {
        event.preventDefault()
        event.stopPropagation()
        openExternalUrl(anchor.href)
        return
      }

      event.preventDefault()
      event.stopPropagation()
    }

    editor.view.dom.addEventListener('mousedown', handleModifiedLinkInteraction)
    editor.view.dom.addEventListener('auxclick', handleModifiedLinkInteraction)
    editor.view.dom.addEventListener('click', handleLinkClick)
    return () => {
      editor.view.dom.removeEventListener('mousedown', handleModifiedLinkInteraction)
      editor.view.dom.removeEventListener('auxclick', handleModifiedLinkInteraction)
      editor.view.dom.removeEventListener('click', handleLinkClick)
    }
  }, [editor, onOpenNoteByTitle])

  useEffect(() => {
    if (!isPreviewMode || !previewContainerRef.current) {
      return
    }

    const container = previewContainerRef.current
    
    const handlePreviewMouseDown = (event: Event) => {
      const mouseEvent = event as MouseEvent
      const target = mouseEvent.target as HTMLElement | null
      
      // Find the closest anchor element
      let anchor = target
      while (anchor && anchor !== container) {
        if (anchor.tagName === 'A') {
          break
        }
        anchor = anchor.parentElement
      }
      
      if (!anchor || anchor === container) {
        return
      }
      
      const anchorElement = anchor as HTMLAnchorElement
      const wikiTitle = anchorElement.dataset.wikiLink?.trim()
      
      if (wikiTitle) {
        mouseEvent.preventDefault()
        mouseEvent.stopPropagation()
        mouseEvent.stopImmediatePropagation()
        onOpenNoteByTitle(wikiTitle)
      }
    }

    // Use capture phase to intercept before default handling
    container.addEventListener('mousedown', handlePreviewMouseDown, true)
    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null
      let anchor = target
      while (anchor && anchor !== container) {
        if (anchor.tagName === 'A' && (anchor as HTMLAnchorElement).dataset.wikiLink) {
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          break
        }
        anchor = anchor.parentElement
      }
    }, true)
    
    return () => {
      container.removeEventListener('mousedown', handlePreviewMouseDown, true)
    }
  }, [isPreviewMode, onOpenNoteByTitle])

  useEffect(() => {
    if (paletteState.open) {
      requestAnimationFrame(() => paletteInputRef.current?.focus())
    }
  }, [paletteState.open])

  useEffect(() => {
    // Load audio devices on component mount
    loadAudioDevices()
    
    // Listen for device changes (plug/unplug)
    const handleDeviceChange = () => {
      loadAudioDevices()
    }
    
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.stop()
      }
      window.speechSynthesis.cancel()
    }
  }, [])



  async function insertImageFile(file: File) {
    const editorInstance = editorRef.current
    if (!editorInstance) {
      return
    }

    const src = await readFileAsDataUrl(file)
    if (!src) {
      return
    }

    editorInstance.chain().focus().setImage({ src, alt: file.name || 'image' }).run()
  }

  const filteredCommands = useMemo(() => {
    const query = paletteState.query.trim()
    if (!query) {
      return commands
    }

    return commands.filter((command) =>
      [command.label, command.description, ...command.keywords].some((value) => fuzzyIncludes(value, query))
    )
  }, [commands, paletteState.query])

  function runCommand(command: EditorCommand) {
    const editorInstance = editorRef.current
    if (!editorInstance) {
      return
    }

    if (paletteState.source === 'slash' && paletteState.range) {
      editorInstance.chain().focus().deleteRange(paletteState.range).run()
    }

    command.run(editorInstance)
    closePalette()
    editorInstance.commands.focus('end')
  }

  function handlePaletteKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePalette()
      editorRef.current?.commands.focus()
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const firstCommand = filteredCommands[0]
      if (firstCommand) {
        runCommand(firstCommand)
      }
    }
  }

  const currentLabel = priorityLevels.find((level) => level.value === note.importance)?.label ?? 'Normal'
  const paletteStyle = paletteState.anchor ? getPalettePosition(paletteState.anchor) : getPalettePosition(null)

  return (
    <div className="h-full min-h-0 px-4 py-4 lg:px-6 lg:py-6">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[36px] bg-[rgba(9,12,18,0.62)] shadow-[0_28px_100px_rgba(0,0,0,0.36)] ring-1 ring-white/[0.05] backdrop-blur-2xl">
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Modern Header */}
          <div className="border-b border-white/[0.05] px-6 py-6 lg:px-8">
            <div className="max-w-6xl">
              {/* Top Row: Icon and Title */}
              <div className="flex items-center gap-4 mb-4">
                <button
                  type="button"
                  onClick={() => iconInputRef.current?.click()}
                  className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] text-2xl transition hover:bg-white/[0.08] hover:border-white/[0.1]"
                  style={{ color: note.color || 'var(--sd-text)' }}
                  aria-label="Set icon image"
                  title="Click to change icon"
                >
                  {isImageIcon(note.icon) ? (
                    <img
                      src={note.icon}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    iconLabel(note.icon)
                  )}
                </button>
                
                <div className="min-w-0 flex-1">
                  <input
                    value={note.title}
                    onChange={(event) => onTitleChange(note.id, event.target.value)}
                    placeholder="Untitled note"
                    className="w-full border-0 bg-transparent text-3xl font-bold tracking-[-0.02em] text-[var(--sd-text)] outline-none placeholder:text-[var(--sd-muted)]"
                  />
                </div>

                {/* Action Buttons - Moved to right */}
                <div className="flex gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] p-1.5">
                  <button
                    type="button"
                    onClick={() => setIsInspectorOpen((value) => !value)}
                    className="group relative rounded-lg border border-white/[0.06] bg-white/[0.04] p-2.5 text-lg transition hover:bg-white/[0.08] hover:border-white/[0.1]"
                    aria-label="Show properties"
                    title="Properties"
                  >
                    ⚙️
                    <span className="pointer-events-none absolute -right-1 bottom-full mb-2 whitespace-nowrap rounded-lg bg-black/80 px-3 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                      Properties
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsLinkNotesModalOpen(true)}
                    className="group relative rounded-lg border border-white/[0.06] bg-white/[0.04] p-2.5 text-lg transition hover:bg-white/[0.08] hover:border-white/[0.1]"
                    aria-label="Link notes"
                    title="Link Notes"
                  >
                    🔗
                    <span className="pointer-events-none absolute -right-1 bottom-full mb-2 whitespace-nowrap rounded-lg bg-black/80 px-3 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                      Link Notes
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsTableDialogOpen(true)}
                    className="group relative rounded-lg border border-white/[0.06] bg-white/[0.04] p-2.5 text-lg transition hover:bg-white/[0.08] hover:border-white/[0.1]"
                    aria-label="Insert table"
                    title="Insert Table"
                  >
                    ⊞
                    <span className="pointer-events-none absolute -right-1 bottom-full mb-2 whitespace-nowrap rounded-lg bg-black/80 px-3 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                      Insert Table
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleSpeechRecognition}
                    className={[
                      'group relative rounded-lg border p-2.5 text-lg transition',
                      isListening
                        ? 'border-[rgba(255,110,129,0.3)] bg-[rgba(255,110,129,0.1)]'
                        : 'border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/[0.1]'
                    ].join(' ')}
                    aria-label={isListening ? 'Stop listening' : 'Start listening'}
                    title={isListening ? 'Listening...' : 'Listen'}
                  >
                    🎤
                    <span className="pointer-events-none absolute -right-1 bottom-full mb-2 whitespace-nowrap rounded-lg bg-black/80 px-3 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                      {isListening ? 'Listening...' : 'Listen'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMicInfoOpen(true)}
                    className="group relative rounded-lg border border-white/[0.06] bg-white/[0.04] p-2.5 text-lg transition hover:bg-white/[0.08] hover:border-white/[0.1]"
                    aria-label="Microphone help"
                    title="Mic Help"
                  >
                    ❓
                    <span className="pointer-events-none absolute -right-1 bottom-full mb-2 whitespace-nowrap rounded-lg bg-black/80 px-3 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                      Mic Help
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      loadAudioDevices()
                      setIsAudioSettingsOpen(true)
                    }}
                    className="group relative rounded-lg border border-white/[0.06] bg-white/[0.04] p-2.5 text-lg transition hover:bg-white/[0.08] hover:border-white/[0.1]"
                    aria-label="Audio settings"
                    title="Audio Settings"
                  >
                    🎙️
                    <span className="pointer-events-none absolute -right-1 bottom-full mb-2 whitespace-nowrap rounded-lg bg-black/80 px-3 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                      Audio Settings
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleTextToSpeech}
                    className={[
                      'group relative rounded-lg border p-2.5 text-lg transition',
                      isSpeaking
                        ? 'border-[rgba(139,211,255,0.3)] bg-[rgba(139,211,255,0.1)]'
                        : 'border-white/[0.06] bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/[0.1]'
                    ].join(' ')}
                    aria-label={isSpeaking ? 'Stop speaking' : 'Read note'}
                    title={isSpeaking ? 'Speaking...' : 'Read'}
                  >
                    🔊
                    <span className="pointer-events-none absolute -right-1 bottom-full mb-2 whitespace-nowrap rounded-lg bg-black/80 px-3 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                      {isSpeaking ? 'Speaking...' : 'Read'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete "${note.title.trim() || 'Untitled'}"? This cannot be undone.`)) {
                        onDelete(note.id)
                      }
                    }}
                    className="group relative rounded-lg border border-[rgba(255,110,129,0.2)] bg-[rgba(255,110,129,0.08)] p-2.5 text-lg transition hover:bg-[rgba(255,110,129,0.14)] hover:border-[rgba(255,110,129,0.3)]"
                    aria-label="Delete note"
                    title="Delete Note"
                  >
                    🗑️
                    <span className="pointer-events-none absolute -right-1 bottom-full mb-2 whitespace-nowrap rounded-lg bg-[rgba(255,110,129,0.9)] px-3 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                      Delete
                    </span>
                  </button>
                </div>
              </div>

              {/* File Input for Icon */}
              <input
                ref={iconInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleIconBrowse(event)}
              />

              {/* Metadata Row */}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--sd-muted)]">
                <span className="flex items-center gap-1">
                  <span className="text-sm">📅</span>
                  Updated {formatDate(note.updatedAt)}
                </span>
                <span className="rounded-lg bg-white/[0.06] border border-white/[0.08] px-2.5 py-1 text-xs font-medium text-[var(--sd-text)] uppercase tracking-wider">
                  ✓ Autosave
                </span>
                {note.pinned && (
                  <span className="rounded-lg bg-[var(--sd-accent-soft)] border border-[var(--sd-accent)]/30 px-2.5 py-1 text-xs font-medium text-[var(--sd-accent)] uppercase tracking-wider">
                    📌 Pinned
                  </span>
                )}
                <span className="rounded-lg bg-white/[0.06] border border-white/[0.08] px-2.5 py-1 text-xs font-medium text-[var(--sd-text)] uppercase tracking-wider">
                  Priority: {currentLabel}
                </span>
              </div>

              <AnimatePresence initial={false}>
                {isInspectorOpen ? (
                  <motion.section
                    key="inspector"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.16 }}
                    className="mt-5 overflow-hidden rounded-[28px] border border-white/[0.05] bg-white/[0.03]"
                  >
                    <div className="flex items-center justify-between gap-3 px-5 py-4">
                      <p className="text-sm font-medium text-[var(--sd-text)]">Properties</p>
                      <button
                        type="button"
                        onClick={() => setIsInspectorOpen(false)}
                        className="rounded-full border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-xs text-[var(--sd-text)] transition hover:bg-white/[0.08]"
                      >
                        Hide
                      </button>
                    </div>

                    <div className="border-t border-white/[0.05] p-5">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-2">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                            Icon
                          </span>
                          <div className="flex gap-2">
                            <input
                              value={isImageIcon(note.icon) ? '' : note.icon}
                              onChange={(event) => onIconChange(note.id, event.target.value)}
                              placeholder="o"
                              className="min-w-0 flex-1 rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm text-[var(--sd-text)] outline-none placeholder:text-[var(--sd-muted)] focus:border-[var(--sd-accent)]"
                            />
                            <button
                              type="button"
                              onClick={() => iconInputRef.current?.click()}
                              className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-[var(--sd-text)] transition hover:bg-white/[0.08]"
                            >
                              Browse
                            </button>
                            <button
                              type="button"
                              onClick={() => onIconChange(note.id, '')}
                              className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-[var(--sd-text)] transition hover:bg-white/[0.08]"
                            >
                              Clear
                            </button>
                          </div>
                        </label>

                        <label className="grid gap-2">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                            Color
                          </span>
                          <input
                            type="color"
                            value={note.color || '#8bd3ff'}
                            onChange={(event) => onColorChange(note.id, event.target.value)}
                            className="h-[48px] w-full cursor-pointer rounded-2xl border border-white/[0.06] bg-black/10 p-1"
                          />
                        </label>

                        <label className="grid gap-2">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                            Priority
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {priorityLevels.map((level) => (
                              <button
                                type="button"
                                key={level.value}
                                onClick={() => onImportanceChange(note.id, level.value)}
                                className={[
                                  'rounded-full px-3 py-2 text-xs transition',
                                  note.importance === level.value
                                    ? 'bg-[var(--sd-accent-soft)] text-[var(--sd-text)]'
                                    : 'bg-white/[0.04] text-[var(--sd-muted)] hover:bg-white/[0.07] hover:text-[var(--sd-text)]'
                                ].join(' ')}
                              >
                                {level.label}
                              </button>
                            ))}
                          </div>
                        </label>

                        <label className="grid gap-2">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                            Pinned
                          </span>
                          <button
                            type="button"
                            onClick={() => onPinnedChange(note.id, !note.pinned)}
                            className={[
                              'rounded-2xl border px-4 py-3 text-left text-sm transition',
                              note.pinned
                                ? 'border-[var(--sd-accent)] bg-[var(--sd-accent-soft)] text-[var(--sd-text)]'
                                : 'border-white/[0.06] bg-black/10 text-[var(--sd-muted)] hover:bg-white/[0.06] hover:text-[var(--sd-text)]'
                            ].join(' ')}
                          >
                            {note.pinned ? 'Pinned to the top' : 'Keep this note visible'}
                          </button>
                        </label>

                        <label className="grid gap-2 sm:col-span-2">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                            Tags
                          </span>
                          <input
                            value={note.tags}
                            onChange={(event) => onTagsChange(note.id, normalizeTags(event.target.value))}
                            placeholder="Work, Ideas, Research"
                            className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm text-[var(--sd-text)] outline-none placeholder:text-[var(--sd-muted)] focus:border-[var(--sd-accent)]"
                          />
                        </label>

                        <label className="grid gap-2 sm:col-span-2">
                          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                            Reminder
                          </span>
                          <input
                            type="datetime-local"
                            value={note.reminderAt ? note.reminderAt.slice(0, 16) : ''}
                            onChange={(event) => onReminderChange(note.id, event.target.value)}
                            className="rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm text-[var(--sd-text)] outline-none focus:border-[var(--sd-accent)]"
                          />
                        </label>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-3 text-xs text-[var(--sd-muted)]">
                          <span>Created {formatDate(note.createdAt)}</span>
                          <span>Updated {formatDate(note.updatedAt)}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onDelete(note.id)}
                          className="rounded-full border border-[rgba(255,120,140,0.2)] bg-[rgba(255,120,140,0.08)] px-4 py-2 text-xs font-medium text-[var(--sd-danger)] transition hover:bg-[rgba(255,120,140,0.14)]"
                        >
                          Delete note
                        </button>
                      </div>
                    </div>
                  </motion.section>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          <div className="min-h-0 flex-1 px-6 py-4 lg:px-8 lg:py-6">
            <div className="flex h-full min-h-0 justify-center">
              <div className="editor-stage relative h-full min-h-0 w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/[0.05] bg-[rgba(7,10,15,0.42)] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPreviewMode((value) => !value)}
                    className={[
                      'rounded-full border px-3 py-2 text-xs transition backdrop-blur',
                      isPreviewMode
                        ? 'border-[var(--sd-accent)] bg-[var(--sd-accent-soft)] text-[var(--sd-text)]'
                        : 'border-white/[0.08] bg-[rgba(12,16,22,0.65)] text-[var(--sd-text)] hover:bg-[rgba(12,16,22,0.85)]'
                    ].join(' ')}
                  >
                    {isPreviewMode ? 'Preview' : 'Edit'}
                  </button>
                </div>
                {editor ? (
                  <>
                    <BubbleMenu
                      editor={editor}
                      shouldShow={() => !isPreviewMode && !editor.state.selection.empty}
                    >
                      <div className="flex flex-wrap items-center gap-1 rounded-full border border-white/[0.08] bg-[rgba(12,16,22,0.96)] p-1 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                        {[
                          ['Bold', () => editor.chain().focus().toggleBold().run()],
                          ['Italic', () => editor.chain().focus().toggleItalic().run()],
                          ['Underline', () => editor.chain().focus().toggleUnderline().run()],
                          ['Strike', () => editor.chain().focus().toggleStrike().run()],
                          ['Link', () => insertLink(editor)],
                          ['Note Link', () => openNoteLinkPicker(editor)],
                          ['Code', () => editor.chain().focus().toggleCode().run()],
                          ['Highlight', () => editor.chain().focus().toggleHighlight().run()]
                        ].map(([label, action]) => (
                          <button
                            type="button"
                            key={label as string}
                            onClick={() => (action as () => void)()}
                            className="rounded-full px-3 py-2 text-xs text-[var(--sd-text)] transition hover:bg-white/[0.08]"
                          >
                            {label as string}
                          </button>
                        ))}
                      </div>
                    </BubbleMenu>

                    <BubbleMenu
                      editor={editor}
                      shouldShow={() => !isPreviewMode && editor.isActive('table')}
                    >
                      <div className="flex flex-col gap-1 rounded-2xl border border-white/[0.08] bg-[rgba(12,16,22,0.98)] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur">
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().addRowBefore().run()}
                            className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-xs font-medium text-[var(--sd-text)] transition hover:bg-white/[0.08]"
                            title="Add row above"
                          >
                            ➕ Row ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().addRowAfter().run()}
                            className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-xs font-medium text-[var(--sd-text)] transition hover:bg-white/[0.08]"
                            title="Add row below"
                          >
                            ➕ Row ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().addColBefore().run()}
                            className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-xs font-medium text-[var(--sd-text)] transition hover:bg-white/[0.08]"
                            title="Add column before"
                          >
                            ➕ Col ←
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().addColAfter().run()}
                            className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-xs font-medium text-[var(--sd-text)] transition hover:bg-white/[0.08]"
                            title="Add column after"
                          >
                            ➕ Col →
                          </button>
                        </div>
                        <div className="my-1 h-px bg-white/[0.08]" />
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().deleteRow().run()}
                            className="rounded-lg border border-[rgba(255,110,129,0.2)] bg-[rgba(255,110,129,0.08)] px-3 py-2 text-xs font-medium text-[rgba(255,110,129,0.9)] transition hover:bg-[rgba(255,110,129,0.14)]"
                            title="Delete row"
                          >
                            ❌ Delete Row
                          </button>
                          <button
                            type="button"
                            onClick={() => editor.chain().focus().deleteColumn().run()}
                            className="rounded-lg border border-[rgba(255,110,129,0.2)] bg-[rgba(255,110,129,0.08)] px-3 py-2 text-xs font-medium text-[rgba(255,110,129,0.9)] transition hover:bg-[rgba(255,110,129,0.14)]"
                            title="Delete column"
                          >
                            ❌ Delete Col
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => editor.chain().focus().deleteTable().run()}
                          className="rounded-lg border border-[rgba(255,110,129,0.3)] bg-[rgba(255,110,129,0.1)] px-3 py-2 text-xs font-medium text-[rgba(255,110,129,0.95)] transition hover:bg-[rgba(255,110,129,0.18)]"
                          title="Delete entire table"
                        >
                          🗑️ Delete Table
                        </button>
                      </div>
                    </BubbleMenu>

                    {isPreviewMode ? (
                      <div 
                        ref={previewContainerRef}
                        className="sd-markdown prose prose-invert max-w-none overflow-auto p-6 text-[var(--sd-text)]"
                      >
                        <div
                          dangerouslySetInnerHTML={{ __html: note.content }}
                          className="prose prose-invert max-w-none"
                        />
                      </div>
                    ) : (
                      <EditorContent editor={editor} className="h-full" />
                    )}
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-[var(--sd-muted)]">
                    Loading editor...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {paletteState.open ? (
          <motion.div
            className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePalette}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={(event) => event.stopPropagation()}
              className="absolute w-[min(92vw,640px)] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[rgba(11,15,20,0.98)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
              style={{
                left: `${paletteStyle.left}px`,
                top: `${paletteStyle.top}px`
              }}
            >
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
                <span className="text-sm text-[var(--sd-muted)]">/</span>
                <input
                  ref={paletteInputRef}
                  value={paletteState.query}
                  onChange={(event) =>
                    setPaletteState((state) => ({ ...state, query: event.target.value }))
                  }
                  onKeyDown={handlePaletteKeyDown}
                  placeholder="Search commands"
                  className="w-full border-0 bg-transparent text-sm text-[var(--sd-text)] outline-none placeholder:text-[var(--sd-muted)]"
                />
                <kbd className="rounded-full bg-white/[0.05] px-2 py-1 text-[11px] text-[var(--sd-muted)]">
                  Esc
                </kbd>
              </div>

              <div className="max-h-[46vh] overflow-y-auto p-2">
                {filteredCommands.length > 0 ? (
                  <div className="grid gap-1">
                    {filteredCommands.map((command) => (
                      <button
                        type="button"
                        key={command.id}
                        onClick={() => runCommand(command)}
                        className="flex items-start justify-between gap-4 rounded-[20px] px-4 py-3 text-left transition hover:bg-white/[0.06]"
                      >
                        <div>
                          <p className="text-sm font-medium text-[var(--sd-text)]">{command.label}</p>
                          <p className="mt-1 text-xs leading-5 text-[var(--sd-muted)]">
                            {command.description}
                          </p>
                        </div>
                        <span className="rounded-full bg-white/[0.05] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--sd-muted)]">
                          Command
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-white/[0.05] bg-white/[0.03] px-4 py-8 text-center text-sm text-[var(--sd-muted)]">
                    No commands match your search.
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <NoteLinkPicker
        isOpen={isLinkPickerOpen}
        query={linkPickerQuery}
        notes={allNotes}
        onQueryChange={setLinkPickerQuery}
        onClose={() => setIsLinkPickerOpen(false)}
        onPick={handlePickWikiLink}
      />

      <AnimatePresence>
        {isLinkNotesModalOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsLinkNotesModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[420px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[rgba(11,15,20,0.98)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            >
              <div className="border-b border-white/[0.06] px-5 py-4">
                <h3 className="text-lg font-semibold text-[var(--sd-text)]">Link Notes</h3>
                <p className="mt-1 text-xs text-[var(--sd-muted)]">Select a note to create a connection</p>
                <input
                  type="text"
                  placeholder="Search notes..."
                  value={linkNotesSearch}
                  onChange={(e) => setLinkNotesSearch(e.target.value)}
                  className="mt-3 w-full rounded-2xl border border-white/[0.06] bg-black/10 px-4 py-3 text-sm text-[var(--sd-text)] outline-none placeholder:text-[var(--sd-muted)] focus:border-[var(--sd-accent)]"
                  autoFocus
                />
              </div>

              <div className="max-h-[400px] overflow-auto p-4">
                {allNotes
                  .filter((n) => n.id !== note.id)
                  .filter((n) =>
                    !linkNotesSearch ||
                    n.title.toLowerCase().includes(linkNotesSearch.toLowerCase())
                  )
                  .map((targetNote) => (
                    <button
                      key={targetNote.id}
                      type="button"
                      onClick={() => handleLinkNoteFromModal(targetNote)}
                      className="mb-2 w-full text-left rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 transition hover:bg-white/[0.08] hover:border-white/[0.12]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-lg">{noteGlyph(targetNote)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-[var(--sd-text)]">
                            {targetNote.title || 'Untitled note'}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs text-[var(--sd-muted)]">
                            {stripText(targetNote.content)}
                          </p>
                        </div>
                        <span className="mt-0.5 shrink-0 text-xs text-[var(--sd-accent)]">Link →</span>
                      </div>
                    </button>
                  ))}

                {allNotes.filter((n) =>
                  n.id !== note.id &&
                  (!linkNotesSearch ||
                    n.title.toLowerCase().includes(linkNotesSearch.toLowerCase()))
                ).length === 0 ? (
                  <p className="text-center text-sm text-[var(--sd-muted)]">
                    {allNotes.length === 1 ? 'No other notes to link' : 'No notes found'}
                  </p>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isTableDialogOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsTableDialogOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[380px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[rgba(11,15,20,0.98)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            >
              <div className="border-b border-white/[0.06] px-5 py-4">
                <h3 className="text-lg font-semibold text-[var(--sd-text)]">Insert Table</h3>
                <p className="mt-1 text-xs text-[var(--sd-muted)]">Configure table dimensions</p>
              </div>

              <div className="space-y-4 p-5">
                <div>
                  <label className="text-sm font-medium text-[var(--sd-text)]">Rows: {tableRows}</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={tableRows}
                    onChange={(e) => setTableRows(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-[var(--sd-text)]">Columns: {tableCols}</label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={tableCols}
                    onChange={(e) => setTableCols(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={tableHeaderRow}
                    onChange={(e) => setTableHeaderRow(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-[var(--sd-text)]">Header row</span>
                </label>
              </div>

              <div className="flex gap-2 border-t border-white/[0.06] px-5 py-3">
                <button
                  type="button"
                  onClick={() => setIsTableDialogOpen(false)}
                  className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.04] px-4 py-2 text-sm font-medium text-[var(--sd-text)] transition hover:bg-white/[0.08]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (editor) {
                      editor
                        .chain()
                        .focus()
                        .insertTable({ rows: tableRows, cols: tableCols, withHeaderRow: tableHeaderRow })
                        .run()
                      setIsTableDialogOpen(false)
                    }
                  }}
                  className="flex-1 rounded-lg bg-[var(--sd-accent)] px-4 py-2 text-sm font-medium text-[var(--sd-accent-contrast)] transition hover:opacity-95"
                >
                  Insert
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isMicInfoOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMicInfoOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[480px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[rgba(11,15,20,0.98)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            >
              <div className="border-b border-white/[0.06] px-5 py-4">
                <h3 className="text-lg font-semibold text-[var(--sd-text)]">🎤 How to Use Microphone</h3>
                <p className="mt-1 text-xs text-[var(--sd-muted)]">Capture voice input for your notes</p>
              </div>

              <div className="space-y-4 p-5 text-sm text-[var(--sd-text)]">
                <div>
                  <p className="font-medium text-[var(--sd-accent)]">📝 How It Works</p>
                  <p className="mt-1 text-[var(--sd-muted)]">Click 🎤 and speak. Your audio captures both system sound and microphone input. Each line is labeled with the source.</p>
                </div>

                <div>
                  <p className="font-medium text-[rgba(255,110,129,1)]">🔧 Setup for YouTube / System Audio</p>
                  <p className="mt-1 text-[var(--sd-muted)] leading-relaxed">
                    By default, microphone captures direct audio in your room. To include YouTube or browser audio:
                  </p>
                  <ul className="mt-2 space-y-1 text-[var(--sd-muted)] list-disc list-inside">
                    <li><strong>Windows:</strong> Enable Stereo Mix (right-click speaker → Recording)</li>
                    <li><strong>Mac:</strong> Use Loopback Audio or SoundFlower</li>
                    <li><strong>All:</strong> Speak over YouTube - mic picks up what you hear</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-white/[0.06] bg-white/[0.04] p-3">
                  <p className="text-xs font-medium text-[var(--sd-accent)]">💡 Tips:</p>
                  <ul className="mt-2 space-y-1 text-[var(--sd-muted)] text-xs list-disc list-inside">
                    <li>Check browser microphone permissions</li>
                    <li>Ensure microphone volume is not muted</li>
                    <li>Test with "Hello" before recording</li>
                    <li>Each audio source is labeled on a new line</li>
                  </ul>
                </div>
              </div>

              <div className="border-t border-white/[0.06] px-5 py-3">
                <button
                  type="button"
                  onClick={() => setIsMicInfoOpen(false)}
                  className="w-full rounded-lg bg-[var(--sd-accent)] px-4 py-2 text-sm font-medium text-[var(--sd-accent-contrast)] transition hover:opacity-95"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isAudioSettingsOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsAudioSettingsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[480px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[rgba(11,15,20,0.98)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
            >
              <div className="border-b border-white/[0.06] px-5 py-4">
                <h3 className="text-lg font-semibold text-[var(--sd-text)]">🎙️ Audio Input Settings</h3>
                <p className="mt-1 text-xs text-[var(--sd-muted)]">Select and test your audio device</p>
              </div>

              <div className="space-y-4 p-5 text-sm text-[var(--sd-text)]">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-[var(--sd-text)]">Audio Input Device:</label>
                    <button
                      type="button"
                      onClick={loadAudioDevices}
                      className="text-xs text-[var(--sd-accent)] hover:text-[var(--sd-accent-soft)] transition"
                      title="Refresh device list"
                    >
                      🔄 Refresh
                    </button>
                  </div>
                  {audioDevices.length > 0 ? (
                    <select
                      value={selectedAudioDeviceId}
                      onChange={(e) => setSelectedAudioDeviceId(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-white/[0.06] bg-[var(--sd-panel)] px-4 py-2 text-sm text-[var(--sd-text)] outline-none focus:border-[var(--sd-accent)] cursor-pointer"
                    >
                      {audioDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId} className="bg-[var(--sd-panel)] text-[var(--sd-text)]">
                          {device.label || `Audio Input ${audioDevices.indexOf(device) + 1}`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.04] px-4 py-2 text-sm text-[var(--sd-muted)]">
                      <p>No audio devices detected</p>
                      <p className="mt-1 text-xs">Try: 1) Plug in your headset 2) Click Refresh above 3) Grant microphone permission</p>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-[var(--sd-text)]">Test Microphone:</label>
                    <button
                      type="button"
                      onClick={testAudioInput}
                      disabled={audioDevices.length === 0}
                      className="rounded-lg bg-[var(--sd-accent)] px-4 py-1.5 text-xs font-medium text-[var(--sd-accent-contrast)] transition hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isTesting ? '⏹️ Stop' : '▶️ Test'}
                    </button>
                  </div>
                  {audioDevices.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs text-[var(--sd-muted)]">Audio Level: {testAudioLevel}%</div>
                      <div className="h-2 w-full rounded-full border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[var(--sd-accent)] to-[rgba(123,200,255,0.8)] transition-all duration-100"
                          style={{ width: `${testAudioLevel}%` }}
                        />
                      </div>
                      <p className="text-xs text-[var(--sd-muted)]">
                        {isTesting ? 'Testing... Speak into your microphone' : 'Click Test to check audio input'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-white/[0.06] bg-white/[0.04] p-3">
                  <p className="text-xs font-medium text-[var(--sd-accent)]">💡 Tips:</p>
                  <ul className="mt-2 space-y-1 text-[var(--sd-muted)] text-xs list-disc list-inside">
                    <li>Plug in your headset before opening this dialog</li>
                    <li>Select your headset from the dropdown above</li>
                    <li>Click Test to verify audio is being picked up</li>
                    <li>Level should move when you speak</li>
                  </ul>
                </div>
              </div>

              <div className="border-t border-white/[0.06] px-5 py-3">
                <button
                  type="button"
                  onClick={() => setIsAudioSettingsOpen(false)}
                  className="w-full rounded-lg bg-[var(--sd-accent)] px-4 py-2 text-sm font-medium text-[var(--sd-accent-contrast)] transition hover:opacity-95"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
