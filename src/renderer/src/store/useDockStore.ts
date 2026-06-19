import { create } from 'zustand'
import { dockApi } from '@/services/backend'
import type { AppState, Note, Settings, StorageInfo, Theme } from '@/types/domain'

type DockStore = {
  notes: Note[]
  settings: Settings
  storageInfo: StorageInfo | null
  selectedNoteId: string | null
  searchQuery: string
  isLoading: boolean
  hasHydrated: boolean
  error: string | null
  hydrate: () => Promise<void>
  createNote: () => Promise<string | null>
  deleteNote: (id: string) => Promise<void>
  reorderNotes: (noteIds: string[]) => Promise<void>
  renameNote: (id: string, title: string) => void
  updateNoteContent: (id: string, content: string) => void
  setNoteIcon: (id: string, icon: string) => void
  setNoteColor: (id: string, color: string) => void
  setNoteImportance: (id: string, importance: number) => void
  setNotePinned: (id: string, pinned: boolean) => void
  setNoteTags: (id: string, tags: string) => void
  setNoteReminderAt: (id: string, reminderAt: string) => void
  setNoteParent: (id: string, parentId: string | null) => void
  setTheme: (theme: Theme) => Promise<void>
  selectNote: (id: string) => void
  setSearchQuery: (query: string) => void
  setDatabasePath: (path: string) => Promise<void>
}

const pendingTimers = new Map<string, number>()

function applyState(
  state: AppState,
  selectedNoteId: string | null
): Pick<DockStore, 'notes' | 'settings' | 'selectedNoteId'> {
  const activeSelection = state.notes.some((note) => note.id === selectedNoteId)
    ? selectedNoteId
    : state.notes[0]?.id ?? null

  return {
    notes: state.notes,
    settings: state.settings,
    selectedNoteId: activeSelection
  }
}

function orderNotes(notes: Note[], noteIds: string[]): Note[] {
  const byId = new Map(notes.map((note) => [note.id, note]))
  return noteIds.map((id) => byId.get(id)).filter((note): note is Note => note !== undefined)
}

function clearPendingSync(id: string) {
  const timer = pendingTimers.get(id)
  if (timer !== undefined) {
    window.clearTimeout(timer)
    pendingTimers.delete(id)
  }
}

function scheduleSync(get: () => DockStore, set: (next: Partial<DockStore>) => void, id: string) {
  clearPendingSync(id)

  const timer = window.setTimeout(async () => {
    pendingTimers.delete(id)
    const current = get().notes.find((note) => note.id === id)
    if (!current) {
      return
    }

    try {
      const state = await dockApi.updateNote(
        id,
        current.title,
        current.content,
        current.icon,
        current.color,
        current.importance,
        current.pinned,
        current.tags,
        current.reminderAt,
        current.parentId || null
      )
      
      // Merge server state with local state, preserving local changes
      const mergedNotes = state.notes.map((serverNote) => {
        const localNote = get().notes.find((n) => n.id === serverNote.id)
        // If this is the note we just synced, use the local version to preserve any uncommitted changes
        if (serverNote.id === id && localNote) {
          return localNote
        }
        return serverNote
      })
      
      const selectedNoteId = get().selectedNoteId
      const activeSelection = mergedNotes.some((note) => note.id === selectedNoteId)
        ? selectedNoteId
        : mergedNotes[0]?.id ?? null

      set({
        notes: mergedNotes,
        settings: state.settings,
        selectedNoteId: activeSelection,
        error: null
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to save note.' })
    }
  }, 250)

  pendingTimers.set(id, timer)
}

export const useDockStore = create<DockStore>((set, get) => ({
  notes: [],
  settings: { theme: 'dark' },
  storageInfo: null,
  selectedNoteId: null,
  searchQuery: '',
  isLoading: true,
  hasHydrated: false,
  error: null,
  hydrate: async () => {
    if (get().hasHydrated) {
      return
    }

    try {
      const state = await dockApi.getState()
      let storageInfo: StorageInfo | null = null
      try {
        storageInfo = await dockApi.getStorageInfo()
      } catch {
        storageInfo = null
      }
      const next = applyState(state, get().selectedNoteId)
      set({ ...next, storageInfo, isLoading: false, hasHydrated: true, error: null })
    } catch (error) {
      set({
        isLoading: false,
        hasHydrated: true,
        error: error instanceof Error ? error.message : 'Failed to load app state.'
      })
    }
  },
  createNote: async () => {
    try {
      const state = await dockApi.createNote()
      const newNoteId = state.notes[0]?.id ?? null
      const next = applyState(state, newNoteId)
      set({ ...next, error: null })
      return newNoteId
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to create note.' })
      return null
    }
  },
  deleteNote: async (id: string) => {
    clearPendingSync(id)

    try {
      const state = await dockApi.deleteNote(id)
      const currentSelection = get().selectedNoteId
      const nextSelection = currentSelection === id ? state.notes[0]?.id ?? null : currentSelection
      const next = applyState(state, nextSelection)
      set({ ...next, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to delete note.' })
    }
  },
  reorderNotes: async (noteIds: string[]) => {
    const previous = get().notes
    const reordered = orderNotes(previous, noteIds)
    set({ notes: reordered })

    try {
      const state = await dockApi.reorderNotes(noteIds)
      const next = applyState(state, get().selectedNoteId)
      set({ ...next, error: null })
    } catch (error) {
      set({
        notes: previous,
        error: error instanceof Error ? error.message : 'Failed to reorder notes.'
      })
    }
  },
  renameNote: (id: string, title: string) => {
    set((state) => ({
      notes: state.notes.map((note) => (note.id === id ? { ...note, title } : note))
    }))
    scheduleSync(get, (next) => set(next), id)
  },
  updateNoteContent: (id: string, content: string) => {
    set((state) => ({
      notes: state.notes.map((note) => (note.id === id ? { ...note, content } : note))
    }))
    scheduleSync(get, (next) => set(next), id)
  },
  setNoteIcon: (id: string, icon: string) => {
    set((state) => ({
      notes: state.notes.map((note) => (note.id === id ? { ...note, icon } : note))
    }))
    scheduleSync(get, (next) => set(next), id)
  },
  setNoteColor: (id: string, color: string) => {
    set((state) => ({
      notes: state.notes.map((note) => (note.id === id ? { ...note, color } : note))
    }))
    scheduleSync(get, (next) => set(next), id)
  },
  setNoteImportance: (id: string, importance: number) => {
    const normalized = Math.max(0, Math.min(3, Math.trunc(importance)))
    set((state) => ({
      notes: state.notes.map((note) => (note.id === id ? { ...note, importance: normalized } : note))
    }))
    scheduleSync(get, (next) => set(next), id)
  },
  setNotePinned: (id: string, pinned: boolean) => {
    set((state) => ({
      notes: state.notes.map((note) => (note.id === id ? { ...note, pinned } : note))
    }))
    scheduleSync(get, (next) => set(next), id)
  },
  setNoteTags: (id: string, tags: string) => {
    set((state) => ({
      notes: state.notes.map((note) => (note.id === id ? { ...note, tags } : note))
    }))
    scheduleSync(get, (next) => set(next), id)
  },
  setNoteReminderAt: (id: string, reminderAt: string) => {
    set((state) => ({
      notes: state.notes.map((note) => (note.id === id ? { ...note, reminderAt } : note))
    }))
    scheduleSync(get, (next) => set(next), id)
  },
  setNoteParent: (id: string, parentId: string | null) => {
    set((state) => ({
      notes: state.notes.map((note) => (note.id === id ? { ...note, parentId } : note))
    }))
    scheduleSync(get, (next) => set(next), id)
  },
  setTheme: async (theme: Theme) => {
    set((state) => ({
      settings: { ...state.settings, theme }
    }))

    try {
      const state = await dockApi.setTheme(theme)
      const next = applyState(state, get().selectedNoteId)
      set({ ...next, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to save theme.' })
    }
  },
  selectNote: (id: string) => {
    set({ selectedNoteId: id })
  },
  setSearchQuery: (query: string) => {
    set({ searchQuery: query })
  },
  setDatabasePath: async (path: string) => {
    try {
      const state = await dockApi.setDatabasePath(path)
      let storageInfo: StorageInfo | null = null
      try {
        storageInfo = await dockApi.getStorageInfo()
      } catch {
        storageInfo = null
      }
      const next = applyState(state, state.notes[0]?.id ?? null)
      set({ ...next, storageInfo, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to switch databases.' })
    }
  }
}))
