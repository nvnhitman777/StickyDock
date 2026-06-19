import type { AppState, StorageInfo, Theme } from '@/types/domain'

function getAppApi() {
  const api = window.go?.main?.App
  if (!api) {
    throw new Error('Wails bridge is not available.')
  }

  return api
}

export const dockApi = {
  getState(): Promise<AppState> {
    return getAppApi().GetState()
  },
  getStorageInfo(): Promise<StorageInfo> {
    return getAppApi().GetStorageInfo()
  },
  pickDatabaseFile(): Promise<string> {
    return getAppApi().PickDatabaseFile()
  },
  pickDatabaseFolder(): Promise<string> {
    return getAppApi().PickDatabaseFolder()
  },
  setDatabasePath(path: string): Promise<AppState> {
    return getAppApi().SetDatabasePath(path)
  },
  createNote(): Promise<AppState> {
    return getAppApi().CreateNote()
  },
  updateNote(
    id: string,
    title: string,
    content: string,
    icon: string,
    color: string,
    importance: number,
    pinned: boolean,
    tags: string,
    reminderAt: string,
    parentId: string | null = null
  ): Promise<AppState> {
    return getAppApi().UpdateNote(id, title, content, icon, color, importance, pinned, tags, reminderAt, parentId || '')
  },
  updateNoteIcon(id: string, icon: string): Promise<AppState> {
    return getAppApi().UpdateNoteIcon(id, icon)
  },
  updateNoteStyle(id: string, color: string, importance: number): Promise<AppState> {
    return getAppApi().UpdateNoteStyle(id, color, importance)
  },
  deleteNote(id: string): Promise<AppState> {
    return getAppApi().DeleteNote(id)
  },
  reorderNotes(noteIds: string[]): Promise<AppState> {
    return getAppApi().ReorderNotes(noteIds)
  },
  setTheme(theme: Theme): Promise<AppState> {
    return getAppApi().SetTheme(theme)
  },
  openAppDataFolder(): Promise<void> {
    return getAppApi().OpenAppDataFolder()
  },
  getBackupDatabasePath(): Promise<string> {
    return getAppApi().GetBackupDatabasePath?.() ?? Promise.reject(new Error('Not available'))
  },
  readDatabaseFile(path: string): Promise<Uint8Array> {
    return getAppApi().ReadDatabaseFile?.(path) ?? Promise.reject(new Error('Not available'))
  }
}
