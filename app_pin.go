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
	fmt.Printf("[Backend] LockDatabase called, result: %v, err: %v\n", result, err)
	return result, err
}

// UnlockDatabase unlocks the app after successful PIN verification
func (a *App) UnlockDatabase() (bool, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	result, err := a.store.UnlockApp()
	fmt.Printf("[Backend] UnlockDatabase called, result: %v, err: %v\n", result, err)
	return result, err
}

// GetAuthStatus returns the current auth status
func (a *App) GetAuthStatus() (AuthState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	state, err := a.store.GetAuthState()
	fmt.Printf("[Backend] GetAuthStatus called, IsLocked: %v, HasPIN: %v, err: %v\n", state.IsLocked, state.HasPIN, err)
	return state, err
}
