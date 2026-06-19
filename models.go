package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type Theme string

const (
	ThemeDark   Theme = "dark"
	ThemeLight  Theme = "light"
	ThemeSystem Theme = "system"
)

type Note struct {
	ID         string    `json:"id"`
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	Icon       string    `json:"icon"`
	Color      string    `json:"color"`
	Importance int       `json:"importance"`
	Pinned     bool      `json:"pinned"`
	Tags       string    `json:"tags"`
	ReminderAt string    `json:"reminderAt"`
	ParentID   *string   `json:"parentId"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type Settings struct {
	Theme Theme `json:"theme"`
}

type StorageInfo struct {
	DatabasePath       string   `json:"databasePath"`
	DatabaseName       string   `json:"databaseName"`
	KnownDatabasePaths []string `json:"knownDatabasePaths"`
}

type AuthState struct {
	IsLocked      bool   `json:"isLocked"`
	HasPIN        bool   `json:"hasPIN"`
	IsAuthenticated bool `json:"isAuthenticated"`
}

type AppState struct {
	Notes    []Note   `json:"notes"`
	Settings Settings `json:"settings"`
	Auth     AuthState `json:"auth"`
}

func appDataDir() string {
	if base, err := os.UserConfigDir(); err == nil && base != "" {
		return filepath.Join(base, "StickyDock")
	}

	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return filepath.Join(home, ".stickydock")
	}

	return "."
}

func appDatabasePath() string {
	return filepath.Join(appDataDir(), "StickyDock.db")
}

func appConfigPath() string {
	return filepath.Join(appDataDir(), "config.json")
}

func legacyJSONPaths() (string, string) {
	dataDir := appDataDir()
	return filepath.Join(dataDir, "notes.json"), filepath.Join(dataDir, "settings.json")
}

func newID() string {
	var raw [8]byte
	if _, err := rand.Read(raw[:]); err == nil {
		return hex.EncodeToString(raw[:])
	}

	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func defaultState() AppState {
	return AppState{
		Notes:    []Note{},
		Settings: Settings{Theme: ThemeDark},
	}
}

func normalizeState(state AppState) AppState {
	if state.Settings.Theme != ThemeLight && state.Settings.Theme != ThemeDark && state.Settings.Theme != ThemeSystem {
		state.Settings.Theme = ThemeDark
	}
	if state.Notes == nil {
		state.Notes = []Note{}
	}
	for index := range state.Notes {
		if state.Notes[index].Color == "" {
			state.Notes[index].Color = defaultNoteColor()
		}
		if state.Notes[index].Importance < 0 {
			state.Notes[index].Importance = 0
		}
		if state.Notes[index].Importance > 3 {
			state.Notes[index].Importance = 3
		}
	}
	return state
}

func defaultNoteColor() string {
	return "#8bd3ff"
}
