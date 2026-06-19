package main

import (
	"crypto/sha256"
	"encoding/hex"
)

// hashPIN returns SHA256 hash of PIN
func hashPIN(pin string) string {
	hash := sha256.Sum256([]byte(pin))
	return hex.EncodeToString(hash[:])
}

// SetPIN sets the PIN for the app (4-6 digits)
func (s *SQLiteStore) SetPIN(pin string) (bool, error) {
	// Validate PIN format (4-6 digits)
	if len(pin) < 4 || len(pin) > 6 {
		return false, nil
	}
	for _, ch := range pin {
		if ch < '0' || ch > '9' {
			return false, nil
		}
	}

	hashedPIN := hashPIN(pin)
	if _, err := s.db.Exec(
		`UPDATE settings SET value = ? WHERE key = 'pin_hash'`,
		hashedPIN,
	); err != nil {
		return false, err
	}

	return true, nil
}

// VerifyPIN checks if the provided PIN is correct
func (s *SQLiteStore) VerifyPIN(pin string) (bool, error) {
	var storedHash string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key = 'pin_hash'`).Scan(&storedHash)
	if err != nil {
		if err.Error() == "sql: no rows" {
			return false, nil
		}
		return false, err
	}

	if storedHash == "" {
		return false, nil
	}

	hashedPIN := hashPIN(pin)
	return hashedPIN == storedHash, nil
}

// LockApp locks the app by setting is_locked to 1
func (s *SQLiteStore) LockApp() (bool, error) {
	if _, err := s.db.Exec(
		`UPDATE settings SET value = ? WHERE key = 'is_locked'`,
		"1",
	); err != nil {
		return false, err
	}
	return true, nil
}

// UnlockApp unlocks the app by setting is_locked to 0
func (s *SQLiteStore) UnlockApp() (bool, error) {
	if _, err := s.db.Exec(
		`UPDATE settings SET value = ? WHERE key = 'is_locked'`,
		"0",
	); err != nil {
		return false, err
	}
	return true, nil
}

// GetAuthState returns the current auth state
func (s *SQLiteStore) GetAuthState() (AuthState, error) {
	var pinHash string
	var isLocked string

	if err := s.db.QueryRow(`SELECT value FROM settings WHERE key = 'pin_hash'`).Scan(&pinHash); err != nil {
		if err.Error() != "sql: no rows" {
			return AuthState{}, err
		}
	}

	if err := s.db.QueryRow(`SELECT value FROM settings WHERE key = 'is_locked'`).Scan(&isLocked); err != nil {
		if err.Error() != "sql: no rows" {
			return AuthState{}, err
		}
	}

	return AuthState{
		IsLocked:        isLocked == "1",
		HasPIN:          pinHash != "",
		IsAuthenticated: false,
	}, nil
}
