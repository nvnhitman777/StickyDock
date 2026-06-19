import type { AppState, StorageInfo, Theme } from '@/types/domain'

declare global {
  interface Window {
    runtime?: {
      BrowserOpenURL(url: string): void
    }
    go?: {
      main: {
        App: {
          GetState(): Promise<AppState>
          GetStorageInfo(): Promise<StorageInfo>
          PickDatabaseFile(): Promise<string>
          PickDatabaseFolder(): Promise<string>
          CreateNote(): Promise<AppState>
          UpdateNote(
            id: string,
            title: string,
            content: string,
            icon: string,
            color: string,
            importance: number,
            pinned: boolean,
            tags: string,
            reminderAt: string,
            parentId: string
          ): Promise<AppState>
          RenameNote(id: string, title: string): Promise<AppState>
          UpdateNoteContent(id: string, content: string): Promise<AppState>
          UpdateNoteIcon(id: string, icon: string): Promise<AppState>
          UpdateNoteStyle(id: string, color: string, importance: number): Promise<AppState>
          DeleteNote(id: string): Promise<AppState>
          ReorderNotes(noteIds: string[]): Promise<AppState>
          SetTheme(theme: Theme): Promise<AppState>
          OpenAppDataFolder(): Promise<void>
          GetBackupDatabasePath(): Promise<string>
          ReadDatabaseFile(path: string): Promise<Uint8Array>
          GetAppMetrics(): Promise<AppMetrics>
          SetDatabasePath(path: string): Promise<AppState>
        }
      }
    }
  }
}

export {}
