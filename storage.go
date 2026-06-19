package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type AppStore interface {
	LoadState() (AppState, error)
	CreateNote() (AppState, error)
	UpdateNote(id string, title string, content string, icon string, color string, importance int, pinned bool, tags string, reminderAt string, parentID *string) (AppState, error)
	RenameNote(id string, title string) (AppState, error)
	UpdateNoteContent(id string, content string) (AppState, error)
	UpdateNoteIcon(id string, icon string) (AppState, error)
	UpdateNoteStyle(id string, color string, importance int) (AppState, error)
	DeleteNote(id string) (AppState, error)
	ReorderNotes(noteIDs []string) (AppState, error)
	SetTheme(theme Theme) (AppState, error)
	SetPIN(pin string) (bool, error)
	VerifyPIN(pin string) (bool, error)
	LockApp() (bool, error)
	UnlockApp() (bool, error)
	GetAuthState() (AuthState, error)
}

type AppConfig struct {
	ActiveDatabasePath string   `json:"activeDatabasePath"`
	KnownDatabasePaths []string `json:"knownDatabasePaths"`
}

type SQLiteStore struct {
	db   *sql.DB
	path string
}

func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	store := &SQLiteStore{db: db, path: dbPath}
	if err := store.init(); err != nil {
		_ = db.Close()
		return nil, err
	}

	if err := store.migrateLegacyJSON(); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

func (s *SQLiteStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *SQLiteStore) StorageInfo() StorageInfo {
	return StorageInfo{
		DatabasePath:       s.path,
		DatabaseName:       filepath.Base(s.path),
		KnownDatabasePaths: nil,
	}
}

func (s *SQLiteStore) AppMetrics() (AppMetrics, error) {
	var notesCount int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM notes`).Scan(&notesCount); err != nil {
		return AppMetrics{}, err
	}

	stat, err := os.Stat(s.path)
	if err != nil {
		return AppMetrics{}, err
	}

	return AppMetrics{
		DatabaseSizeBytes: stat.Size(),
		DatabasePath:      s.path,
		DatabaseName:      filepath.Base(s.path),
		NotesCount:        notesCount,
	}, nil
}

func (s *SQLiteStore) init() error {
	statements := []string{
		`PRAGMA foreign_keys = ON`,
		`PRAGMA journal_mode = WAL`,
		`PRAGMA synchronous = NORMAL`,
		`PRAGMA busy_timeout = 5000`,
		`CREATE TABLE IF NOT EXISTS notes (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			content TEXT NOT NULL,
			icon TEXT NOT NULL DEFAULT '',
			color TEXT NOT NULL DEFAULT '',
			importance INTEGER NOT NULL DEFAULT 0,
			pinned INTEGER NOT NULL DEFAULT 0,
			tags TEXT NOT NULL DEFAULT '',
			reminder_at TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			sort_order INTEGER NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_notes_sort_order ON notes(sort_order)`,
		`CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
	}

	for _, statement := range statements {
		if _, err := s.db.Exec(statement); err != nil {
			return err
		}
	}

	if _, err := s.db.Exec(
		`INSERT OR IGNORE INTO settings(key, value) VALUES('theme', ?)`,
		string(ThemeDark),
	); err != nil {
		return err
	}

	if _, err := s.db.Exec(
		`INSERT OR IGNORE INTO settings(key, value) VALUES('pin_hash', ?)`,
		"",
	); err != nil {
		return err
	}

	if _, err := s.db.Exec(
		`INSERT OR IGNORE INTO settings(key, value) VALUES('is_locked', ?)`,
		"0",
	); err != nil {
		return err
	}

	if err := s.ensureNoteColumns(); err != nil {
		return err
	}

	return nil
}

func (s *SQLiteStore) ensureNoteColumns() error {
	columns := map[string]string{}
	rows, err := s.db.Query(`PRAGMA table_info(notes)`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue sql.NullString
		var primaryKey int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			return err
		}
		columns[name] = columnType
	}
	if err := rows.Err(); err != nil {
		return err
	}

	if _, ok := columns["color"]; !ok {
		if _, err := s.db.Exec(`ALTER TABLE notes ADD COLUMN color TEXT NOT NULL DEFAULT ''`); err != nil {
			return err
		}
	}

	if _, ok := columns["icon"]; !ok {
		if _, err := s.db.Exec(`ALTER TABLE notes ADD COLUMN icon TEXT NOT NULL DEFAULT ''`); err != nil {
			return err
		}
	}

	if _, ok := columns["importance"]; !ok {
		if _, err := s.db.Exec(`ALTER TABLE notes ADD COLUMN importance INTEGER NOT NULL DEFAULT 0`); err != nil {
			return err
		}
	}

	if _, ok := columns["pinned"]; !ok {
		if _, err := s.db.Exec(`ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`); err != nil {
			return err
		}
	}

	if _, ok := columns["tags"]; !ok {
		if _, err := s.db.Exec(`ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT ''`); err != nil {
			return err
		}
	}

	if _, ok := columns["reminder_at"]; !ok {
		if _, err := s.db.Exec(`ALTER TABLE notes ADD COLUMN reminder_at TEXT NOT NULL DEFAULT ''`); err != nil {
			return err
		}
	}

	if _, ok := columns["parent_id"]; !ok {
		if _, err := s.db.Exec(`ALTER TABLE notes ADD COLUMN parent_id TEXT`); err != nil {
			return err
		}
	}

	return nil
}

func (s *SQLiteStore) migrateLegacyJSON() error {
	notesPath, settingsPath := legacyJSONPaths()

	notesExists := fileExists(notesPath)
	settingsExists := fileExists(settingsPath)
	if !notesExists && !settingsExists {
		return nil
	}

	state, err := s.LoadState()
	if err != nil {
		return err
	}

	if len(state.Notes) > 0 {
		return s.removeLegacyFiles(notesPath, settingsPath)
	}

	legacyState, err := readLegacyState(notesPath, settingsPath)
	if err != nil {
		return err
	}

	if len(legacyState.Notes) == 0 && legacyState.Settings.Theme == ThemeDark && !notesExists && !settingsExists {
		return nil
	}

	if err := s.dbTransaction(func(tx *sql.Tx) error {
		for index, note := range legacyState.Notes {
			if _, err := tx.Exec(
				`INSERT INTO notes(id, title, content, icon, color, importance, pinned, tags, reminder_at, created_at, updated_at, sort_order)
				 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				note.ID,
				note.Title,
				note.Content,
				"",
				defaultNoteColor(),
				0,
				0,
				"",
				"",
				formatTime(note.CreatedAt),
				formatTime(note.UpdatedAt),
				index,
			); err != nil {
				return err
			}
		}

		if _, err := tx.Exec(
			`INSERT INTO settings(key, value) VALUES('theme', ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			string(legacyState.Settings.Theme),
		); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return err
	}

	return s.removeLegacyFiles(notesPath, settingsPath)
}

func (s *SQLiteStore) LoadState() (AppState, error) {
	state := defaultState()

	rows, err := s.db.Query(`SELECT id, title, content, icon, color, importance, pinned, tags, reminder_at, parent_id, created_at, updated_at FROM notes ORDER BY sort_order ASC, created_at ASC`)
	if err != nil {
		return AppState{}, err
	}
	defer rows.Close()

	for rows.Next() {
		var note Note
		var createdAt string
		var updatedAt string
		var pinned int
		if err := rows.Scan(&note.ID, &note.Title, &note.Content, &note.Icon, &note.Color, &note.Importance, &pinned, &note.Tags, &note.ReminderAt, &note.ParentID, &createdAt, &updatedAt); err != nil {
			return AppState{}, err
		}
		note.Pinned = pinned != 0

		note.CreatedAt, err = parseTime(createdAt)
		if err != nil {
			return AppState{}, err
		}
		note.UpdatedAt, err = parseTime(updatedAt)
		if err != nil {
			return AppState{}, err
		}

		state.Notes = append(state.Notes, note)
	}

	if err := rows.Err(); err != nil {
		return AppState{}, err
	}

	// Create a default welcome note if database is empty
	if len(state.Notes) == 0 {
		if err := s.dbTransaction(func(tx *sql.Tx) error {
			now := time.Now().UTC()
			welcomeContent := `<h2>🎯 Welcome to StickyDock!</h2>
<p><strong>Your smart, private note-taking app is ready to go!</strong> All notes are stored locally on your computer - no cloud, no tracking.</p>

<h3>⚡ Quick Start (2 minutes)</h3>
<ol>
<li><strong>Create a note:</strong> Click <code>New note</code> button or press Ctrl+N</li>
<li><strong>Type your thoughts:</strong> Changes save automatically (no need to save)</li>
<li><strong>Format text:</strong> Use <code>Bold</code>, <em>Italic</em>, <code>/</code> for commands</li>
<li><strong>Lock your notes:</strong> Click 🔒 to secure with PIN</li>
</ol>

<h3>🎤 Voice Features</h3>
<ul>
<li><strong>🎤 Transcribe:</strong> Click button and speak - your voice becomes text automatically</li>
<li><strong>🔊 Read Aloud:</strong> Hear your notes read by text-to-speech</li>
<li><strong>🎙️ Audio Settings:</strong> Choose microphone, test audio levels</li>
</ul>

<h3>📚 Organization</h3>
<ul>
<li><strong>Hierarchy:</strong> Click <code>+</code> on any note to create child notes (structure your ideas)</li>
<li><strong>Search:</strong> Type in search box to find notes instantly</li>
<li><strong>Tags & Colors:</strong> Customize notes with emojis, colors, priority levels</li>
<li><strong>📊 Graph:</strong> Visualize how your notes connect</li>
</ul>

<h3>⏰ Stay Organized</h3>
<ul>
<li><strong>Reminders:</strong> Set time-based alerts with sound + voice announcement</li>
<li><strong>Tables:</strong> Type <code>/table</code> to insert structured data</li>
<li><strong>Tasks:</strong> Use <code>/checklist</code> for to-do lists</li>
</ul>

<h3>🔐 Security</h3>
<ul>
<li><strong>PIN Lock:</strong> First run: set a PIN. Every run: enter PIN to unlock</li>
<li><strong>🔒 Lock Button:</strong> Instantly lock before handing PC to someone</li>
<li><strong>Local Storage:</strong> Your data never leaves your computer</li>
</ul>

<h3>💡 Pro Tips</h3>
<ul>
<li>Press <code>/</code> in editor to see all slash commands (headings, tables, code blocks, etc.)</li>
<li>Use Ctrl+Click to select multiple notes for bulk delete</li>
<li>Switch workspaces: Open Settings ⚙️ → Choose database</li>
<li>Learn more: Click ❓ Help in the top right</li>
</ul>

<p><strong>Enjoy your notes! Questions? Click ❓ for full help.</strong></p>`
			_, err := tx.Exec(
				`INSERT INTO notes(id, title, content, icon, color, importance, pinned, tags, reminder_at, created_at, updated_at, sort_order)
				 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				newID(),
				"Getting Started",
				welcomeContent,
				"👋",
				defaultNoteColor(),
				0,
				0,
				"",
				"",
				formatTime(now),
				formatTime(now),
				0,
			)
			return err
		}); err != nil {
			return AppState{}, err
		}
		// Reload state after creating default note
		return s.LoadState()
	}

	state = normalizeState(state)
	if err := s.db.QueryRow(`SELECT value FROM settings WHERE key = 'theme'`).Scan(&state.Settings.Theme); err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			return AppState{}, err
		}
	}

	// Load auth state
	var pinHash string
	var isLocked string
	if err := s.db.QueryRow(`SELECT value FROM settings WHERE key = 'pin_hash'`).Scan(&pinHash); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return AppState{}, err
	}
	if err := s.db.QueryRow(`SELECT value FROM settings WHERE key = 'is_locked'`).Scan(&isLocked); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return AppState{}, err
	}

	state.Auth = AuthState{
		IsLocked:        isLocked == "1",
		HasPIN:          pinHash != "",
		IsAuthenticated: false,
	}

	return normalizeState(state), nil
}

func (s *SQLiteStore) CreateNote() (AppState, error) {
	if err := s.dbTransaction(func(tx *sql.Tx) error {
		var sortOrder int
		if err := tx.QueryRow(`SELECT COALESCE(MIN(sort_order), 0) - 1 FROM notes`).Scan(&sortOrder); err != nil {
			return err
		}

		now := time.Now().UTC()
		_, err := tx.Exec(
			`INSERT INTO notes(id, title, content, icon, color, importance, pinned, tags, reminder_at, created_at, updated_at, sort_order)
			 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			newID(),
			"Untitled note",
			"",
			"",
			defaultNoteColor(),
			0,
			0,
			"",
			"",
			formatTime(now),
			formatTime(now),
			sortOrder,
		)
		return err
	}); err != nil {
		return AppState{}, err
	}

	return s.LoadState()
}

func (s *SQLiteStore) UpdateNote(id string, title string, content string, icon string, color string, importance int, pinned bool, tags string, reminderAt string, parentID *string) (AppState, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		title = "Untitled note"
	}
	icon = normalizeNoteIcon(icon)
	color = normalizeNoteColor(color)
	importance = normalizeImportance(importance)
	tags = strings.TrimSpace(tags)
	reminderAt = strings.TrimSpace(reminderAt)

	if err := s.updateNoteFields(id, &title, &content, &icon, &color, &importance, &pinned, &tags, &reminderAt, parentID); err != nil {
		return AppState{}, err
	}

	return s.LoadState()
}

func (s *SQLiteStore) RenameNote(id string, title string) (AppState, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		title = "Untitled note"
	}

	if err := s.updateNoteFields(id, &title, nil, nil, nil, nil, nil, nil, nil, nil); err != nil {
		return AppState{}, err
	}

	return s.LoadState()
}

func (s *SQLiteStore) UpdateNoteContent(id string, content string) (AppState, error) {
	if err := s.updateNoteFields(id, nil, &content, nil, nil, nil, nil, nil, nil, nil); err != nil {
		return AppState{}, err
	}

	return s.LoadState()
}

func (s *SQLiteStore) UpdateNoteIcon(id string, icon string) (AppState, error) {
	icon = normalizeNoteIcon(icon)
	if err := s.updateNoteFields(id, nil, nil, &icon, nil, nil, nil, nil, nil, nil); err != nil {
		return AppState{}, err
	}

	return s.LoadState()
}

func (s *SQLiteStore) UpdateNoteStyle(id string, color string, importance int) (AppState, error) {
	color = normalizeNoteColor(color)
	importance = normalizeImportance(importance)
	if err := s.updateNoteFields(id, nil, nil, nil, &color, &importance, nil, nil, nil, nil); err != nil {
		return AppState{}, err
	}

	return s.LoadState()
}

func (s *SQLiteStore) DeleteNote(id string) (AppState, error) {
	if err := s.dbTransaction(func(tx *sql.Tx) error {
		res, err := tx.Exec(`DELETE FROM notes WHERE id = ?`, id)
		if err != nil {
			return err
		}
		rows, err := res.RowsAffected()
		if err != nil {
			return err
		}
		if rows == 0 {
			return errors.New("note not found")
		}
		return nil
	}); err != nil {
		return AppState{}, err
	}

	return s.LoadState()
}

func (s *SQLiteStore) ReorderNotes(noteIDs []string) (AppState, error) {
	returnAppState := AppState{}
	if err := s.dbTransaction(func(tx *sql.Tx) error {
		rows, err := tx.Query(`SELECT id FROM notes ORDER BY sort_order ASC, created_at ASC`)
		if err != nil {
			return err
		}
		defer rows.Close()

		existing := make([]string, 0)
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return err
			}
			existing = append(existing, id)
		}
		if err := rows.Err(); err != nil {
			return err
		}

		if len(noteIDs) != len(existing) {
			return errors.New("invalid note order")
		}

		existingSet := make(map[string]struct{}, len(existing))
		for _, id := range existing {
			existingSet[id] = struct{}{}
		}

		seen := make(map[string]struct{}, len(noteIDs))
		for index, id := range noteIDs {
			if _, ok := existingSet[id]; !ok {
				return errors.New("invalid note order")
			}
			if _, ok := seen[id]; ok {
				return errors.New("invalid note order")
			}
			seen[id] = struct{}{}
			if _, err := tx.Exec(`UPDATE notes SET sort_order = ? WHERE id = ?`, index, id); err != nil {
				return err
			}
		}

		return nil
	}); err != nil {
		return returnAppState, err
	}

	return s.LoadState()
}

func (s *SQLiteStore) SetTheme(theme Theme) (AppState, error) {
	if theme != ThemeDark && theme != ThemeLight {
		return AppState{}, errors.New("invalid theme")
	}

	if err := s.dbTransaction(func(tx *sql.Tx) error {
		_, err := tx.Exec(
			`INSERT INTO settings(key, value) VALUES('theme', ?)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
			string(theme),
		)
		return err
	}); err != nil {
		return AppState{}, err
	}

	return s.LoadState()
}

func (s *SQLiteStore) updateNoteFields(id string, title *string, content *string, icon *string, color *string, importance *int, pinned *bool, tags *string, reminderAt *string, parentID *string) error {
	return s.dbTransaction(func(tx *sql.Tx) error {
		sets := make([]string, 0, 10)
		args := make([]any, 0, 11)

		if title != nil {
			sets = append(sets, "title = ?")
			args = append(args, *title)
		}
		if content != nil {
			sets = append(sets, "content = ?")
			args = append(args, *content)
		}
		if icon != nil {
			sets = append(sets, "icon = ?")
			args = append(args, *icon)
		}
		if color != nil {
			sets = append(sets, "color = ?")
			args = append(args, *color)
		}
		if importance != nil {
			sets = append(sets, "importance = ?")
			args = append(args, *importance)
		}
		if pinned != nil {
			pinnedValue := 0
			if *pinned {
				pinnedValue = 1
			}
			sets = append(sets, "pinned = ?")
			args = append(args, pinnedValue)
		}
		if tags != nil {
			sets = append(sets, "tags = ?")
			args = append(args, *tags)
		}
		if reminderAt != nil {
			sets = append(sets, "reminder_at = ?")
			args = append(args, *reminderAt)
		}
		if parentID != nil {
			sets = append(sets, "parent_id = ?")
			args = append(args, *parentID)
		}
		sets = append(sets, "updated_at = ?")
		args = append(args, formatTime(time.Now().UTC()))
		args = append(args, id)

		query := fmt.Sprintf("UPDATE notes SET %s WHERE id = ?", strings.Join(sets, ", "))
		res, err := tx.Exec(query, args...)
		if err != nil {
			return err
		}
		rows, err := res.RowsAffected()
		if err != nil {
			return err
		}
		if rows == 0 {
			return errors.New("note not found")
		}
		return nil
	})
}

func (s *SQLiteStore) dbTransaction(fn func(*sql.Tx) error) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}

	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}

func (s *SQLiteStore) removeLegacyFiles(paths ...string) error {
	for _, path := range paths {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}

	return nil
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func readLegacyState(notesPath, settingsPath string) (AppState, error) {
	state := defaultState()

	if fileExists(notesPath) {
		data, err := os.ReadFile(notesPath)
		if err != nil {
			return AppState{}, err
		}

		var payload struct {
			Notes []Note `json:"notes"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			return AppState{}, fmt.Errorf("decode notes.json: %w", err)
		}
		state.Notes = payload.Notes
	}

	if fileExists(settingsPath) {
		data, err := os.ReadFile(settingsPath)
		if err != nil {
			return AppState{}, err
		}

		var payload struct {
			Theme Theme `json:"theme"`
		}
		if err := json.Unmarshal(data, &payload); err != nil {
			return AppState{}, fmt.Errorf("decode settings.json: %w", err)
		}
		if payload.Theme != "" {
			state.Settings.Theme = payload.Theme
		}
	}

	return normalizeState(state), nil
}

func formatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339Nano)
}

func parseTime(value string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, err
	}
	return parsed.UTC(), nil
}

func loadAppConfig() (AppConfig, error) {
	config := AppConfig{
		ActiveDatabasePath: appDatabasePath(),
		KnownDatabasePaths: []string{appDatabasePath()},
	}

	data, err := os.ReadFile(appConfigPath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return normalizeAppConfig(config), nil
		}
		return AppConfig{}, err
	}

	if err := json.Unmarshal(data, &config); err != nil {
		return AppConfig{}, fmt.Errorf("decode config.json: %w", err)
	}

	if config.ActiveDatabasePath == "" {
		config.ActiveDatabasePath = appDatabasePath()
	}
	if len(config.KnownDatabasePaths) == 0 {
		config.KnownDatabasePaths = []string{config.ActiveDatabasePath}
	}

	return normalizeAppConfig(config), nil
}

func saveAppConfig(config AppConfig) error {
	config = normalizeAppConfig(config)
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(appConfigPath()), 0o755); err != nil {
		return err
	}

	return os.WriteFile(appConfigPath(), data, 0o644)
}

func normalizeAppConfig(config AppConfig) AppConfig {
	activePath, err := normalizePath(config.ActiveDatabasePath)
	if err == nil {
		config.ActiveDatabasePath = activePath
	}

	seen := make(map[string]struct{}, len(config.KnownDatabasePaths))
	paths := make([]string, 0, len(config.KnownDatabasePaths)+1)
	addPath := func(path string) {
		normalized, err := normalizePath(path)
		if err != nil || normalized == "" {
			return
		}
		if _, ok := seen[normalized]; ok {
			return
		}
		seen[normalized] = struct{}{}
		paths = append(paths, normalized)
	}

	addPath(config.ActiveDatabasePath)
	for _, path := range config.KnownDatabasePaths {
		addPath(path)
	}

	config.KnownDatabasePaths = paths
	if config.ActiveDatabasePath == "" && len(paths) > 0 {
		config.ActiveDatabasePath = paths[0]
	}

	return config
}

func normalizePath(path string) (string, error) {
	if path == "" {
		return "", nil
	}

	cleaned := filepath.Clean(strings.TrimSpace(path))
	absolute, err := filepath.Abs(cleaned)
	if err != nil {
		return "", err
	}

	return absolute, nil
}

func normalizeNoteColor(color string) string {
	color = strings.TrimSpace(color)
	if color == "" {
		return defaultNoteColor()
	}
	return color
}

func normalizeNoteIcon(icon string) string {
	icon = strings.TrimSpace(icon)
	if icon == "" {
		return ""
	}
	return icon
}

func normalizeImportance(value int) int {
	if value < 0 {
		return 0
	}
	if value > 3 {
		return 3
	}
	return value
}
