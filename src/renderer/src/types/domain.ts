export type Theme = 'dark' | 'light' | 'system'

export interface Note {
  id: string
  title: string
  content: string
  icon: string
  color: string
  importance: number
  pinned: boolean
  tags: string
  reminderAt: string
  createdAt: string
  updatedAt: string
  parentId?: string | null
}

export interface Settings {
  theme: Theme
}

export interface StorageInfo {
  databasePath: string
  databaseName: string
  knownDatabasePaths: string[]
}

export interface AuthState {
  isLocked: boolean
  hasPIN: boolean
  isAuthenticated: boolean
}

export interface AppState {
  notes: Note[]
  settings: Settings
  auth?: AuthState
}
