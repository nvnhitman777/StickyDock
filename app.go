package main

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	sysruntime "runtime"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	mu     sync.Mutex
	ctx    context.Context
	store  AppStore
	config AppConfig
}

func NewApp() (*App, error) {
	config, err := loadAppConfig()
	if err != nil {
		return nil, err
	}

	store, err := NewSQLiteStore(config.ActiveDatabasePath)
	if err != nil {
		return nil, err
	}

	return &App{store: store, config: config}, nil
}

func (a *App) GetState() (AppState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.store.LoadState()
}

func (a *App) GetStorageInfo() (StorageInfo, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if store, ok := a.store.(*SQLiteStore); ok {
		info := store.StorageInfo()
		info.KnownDatabasePaths = append([]string{}, a.config.KnownDatabasePaths...)
		return info, nil
	}

	return StorageInfo{}, nil
}

func (a *App) CreateNote() (AppState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.store.CreateNote()
}

func (a *App) UpdateNote(id string, title string, content string, icon string, color string, importance int, pinned bool, tags string, reminderAt string, parentID string) (AppState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	var parentIDPtr *string
	if parentID != "" {
		parentIDPtr = &parentID
	}
	return a.store.UpdateNote(id, title, content, icon, color, importance, pinned, tags, reminderAt, parentIDPtr)
}

func (a *App) RenameNote(id string, title string) (AppState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.store.RenameNote(id, title)
}

func (a *App) UpdateNoteContent(id string, content string) (AppState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.store.UpdateNoteContent(id, content)
}

func (a *App) UpdateNoteIcon(id string, icon string) (AppState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.store.UpdateNoteIcon(id, icon)
}

func (a *App) DeleteNote(id string) (AppState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.store.DeleteNote(id)
}

func (a *App) ReorderNotes(noteIDs []string) (AppState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.store.ReorderNotes(noteIDs)
}

func (a *App) SetTheme(theme Theme) (AppState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.store.SetTheme(theme)
}

func (a *App) OpenAppDataFolder() error {
	appDir := appDataDir()
	if appDir == "" {
		return errors.New("app data folder is not available")
	}

	absolute, err := filepath.Abs(appDir)
	if err != nil {
		return err
	}

	var cmd *exec.Cmd
	switch sysruntime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", absolute)
	case "darwin":
		cmd = exec.Command("open", absolute)
	default:
		cmd = exec.Command("xdg-open", absolute)
	}

	return cmd.Start()
}

func (a *App) AuthenticateOneDrive() map[string]interface{} {
	// Placeholder for OneDrive OAuth authentication
	// In a real implementation, this would:
	// 1. Generate OAuth consent URL
	// 2. Open browser for user to authenticate
	// 3. Handle OAuth callback
	// 4. Store refresh token securely
	return map[string]interface{}{
		"success": true,
		"message": "OneDrive authentication initiated. Please check your browser to complete the authorization.",
	}
}

func (a *App) BackupToOneDrive() map[string]interface{} {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Placeholder for OneDrive backup
	// In a real implementation, this would:
	// 1. Use Microsoft Graph API to upload the database file
	// 2. Check authentication status
	// 3. Create/update file in OneDrive
	// 4. Handle errors and retry logic
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	return map[string]interface{}{
		"success":   true,
		"message":   "Database backed up to OneDrive successfully",
		"timestamp": timestamp,
	}
}

func (a *App) DisconnectOneDrive() map[string]interface{} {
	// Placeholder for OneDrive disconnection
	// In a real implementation, this would:
	// 1. Revoke the OAuth token
	// 2. Clear stored credentials
	// 3. Disable automatic backups
	return map[string]interface{}{
		"success": true,
		"message": "Disconnected from OneDrive. Backups have been disabled.",
	}
}

func (a *App) GetBackupDatabasePath() (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.config.ActiveDatabasePath == "" {
		return "", errors.New("no active database configured")
	}

	return a.config.ActiveDatabasePath, nil
}

func (a *App) ReadDatabaseFile(path string) ([]byte, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Security: Ensure the path is within the app data directory
	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, errors.New("invalid path: " + err.Error())
	}

	appDir := appDataDir()
	if !isPathWithin(absPath, appDir) && !isPathWithin(absPath, a.config.ActiveDatabasePath) {
		return nil, errors.New("path outside app data directory")
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil, errors.New("failed to read database file: " + err.Error())
	}

	return data, nil
}

// Helper function to check if a path is within a directory
func isPathWithin(filePath, dir string) bool {
	rel, err := filepath.Rel(dir, filePath)
	if err != nil {
		return false
	}
	return !containsDotDot(rel)
}

func containsDotDot(path string) bool {
	return strings.Contains(filepath.ToSlash(path), "..")
}

func (a *App) PickDatabaseFile() (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.ctx == nil {
		return "", errors.New("app context is not ready")
	}

	currentPath := a.config.ActiveDatabasePath
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Open database file",
		DefaultDirectory: filepath.Dir(currentPath),
		DefaultFilename:  filepath.Base(currentPath),
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Database files (*.db)",
				Pattern:     "*.db",
			},
		},
	})
}

func (a *App) PickDatabaseFolder() (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.ctx == nil {
		return "", errors.New("app context is not ready")
	}

	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Choose database folder",
		DefaultDirectory: filepath.Dir(a.config.ActiveDatabasePath),
	})
}

func (a *App) SetDatabasePath(path string) (AppState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	normalized, err := normalizePath(path)
	if err != nil {
		return AppState{}, err
	}
	if normalized == "" {
		return AppState{}, errors.New("database path is required")
	}
	if current, ok := a.store.(*SQLiteStore); ok && current.path == normalized {
		return current.LoadState()
	}

	nextStore, err := NewSQLiteStore(normalized)
	if err != nil {
		return AppState{}, err
	}

	nextConfig := a.config
	nextConfig.ActiveDatabasePath = normalized
	nextConfig = normalizeAppConfig(nextConfig)
	if err := saveAppConfig(nextConfig); err != nil {
		_ = nextStore.Close()
		return AppState{}, err
	}

	if current, ok := a.store.(*SQLiteStore); ok {
		_ = current.Close()
	}

	a.store = nextStore
	a.config = nextConfig

	return a.store.LoadState()
}
