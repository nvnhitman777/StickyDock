package main

import "fmt"

// SetPINCode sets a PIN for app access
func (a *App) SetPINCode(pin string) (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	result, err := a.store.SetPIN(pin)
	fmt.Printf("[Backend] SetPINCode called with PIN length %d, result: %v, err: %v\n", len(pin), result, err)
	return result, err
}

// VerifyPINCode verifies the entered PIN
func (a *App) VerifyPINCode(pin string) (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	verified, err := a.store.VerifyPIN(pin)
	fmt.Printf("[Backend] VerifyPINCode called, verified: %v, err: %v\n", verified, err)
	if err != nil {
		return false, err
	}

	return verified, nil
}

// LockDatabase locks the app
func (a *App) LockDatabase() (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	result, err := a.store.LockApp()
	if err == nil && result {
		a.sessionAuthenticated = false
	}
	fmt.Printf("[Backend] LockDatabase called, result: %v, sessionAuthenticated: %v, err: %v\n", result, a.sessionAuthenticated, err)
	return result, err
}

// UnlockDatabase unlocks the app for this session after successful PIN verification
func (a *App) UnlockDatabase() (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.sessionAuthenticated = true
	fmt.Printf("[Backend] UnlockDatabase called, sessionAuthenticated: %v\n", a.sessionAuthenticated)
	return true, nil
}

// GetAuthStatus returns the current auth status
func (a *App) GetAuthStatus() (AuthState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	state, err := a.store.GetAuthState()
	if err != nil {
		return AuthState{}, err
	}
	state.IsAuthenticated = a.sessionAuthenticated
	fmt.Printf("[Backend] GetAuthStatus called, IsLocked: %v, HasPIN: %v, IsAuthenticated: %v, err: %v\n", state.IsLocked, state.HasPIN, state.IsAuthenticated, err)
	return state, nil
}

// ResetSessionAuthentication clears any current in-memory auth session
func (a *App) ResetSessionAuthentication() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.sessionAuthenticated = false
	fmt.Printf("[Backend] ResetSessionAuthentication called, sessionAuthenticated: %v\n", a.sessionAuthenticated)
	return nil
}
