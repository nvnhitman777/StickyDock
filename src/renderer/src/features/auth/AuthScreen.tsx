import { useEffect, useState } from 'react'
import type { AuthState } from '@/types/domain'

type AuthScreenProps = {
  authState: AuthState
  onAuthenticated: () => void
}

export function AuthScreen({ authState, onAuthenticated }: AuthScreenProps) {
  const [pin, setPin] = useState('')
  const [isSetup, setIsSetup] = useState(false)
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setIsSetup(!authState.hasPIN)
  }, [authState.hasPIN])

  async function handleSetupPin() {
    if (pin.length < 4 || pin.length > 6) {
      setError('PIN must be 4-6 digits')
      return
    }

    if (pin !== confirmPin) {
      setError('PINs do not match')
      return
    }

    const result = await (window as any).go.main.App.SetPINCode(pin)
    if (result) {
      setError('')
      onAuthenticated()
    } else {
      setError('Failed to set PIN')
    }
  }

  async function handleVerifyPin() {
    if (pin.length < 4 || pin.length > 6) {
      setError('PIN must be 4-6 digits')
      return
    }

    const result = await (window as any).go.main.App.VerifyPINCode(pin)
    if (result) {
      // PIN verified - unlock the app for this session
      await (window as any).go.main.App.UnlockDatabase()
      setError('')
      onAuthenticated()
    } else {
      setError('Invalid PIN')
    }
  }

  function handleForgotPin() {
    if (window.confirm('All notes will be permanently deleted. Are you sure?')) {
      // Reset PIN by clearing it
      (window as any).go.main.App.SetPINCode('')
      setPin('')
      setConfirmPin('')
      setError('')
      setIsSetup(true)
    }
  }

  return (
    <div className="flex items-center justify-center w-full h-screen bg-gradient-to-br from-[var(--sd-panel)] to-[var(--sd-bg)] overflow-hidden">
      <div className="w-full max-w-md px-8">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🔐</div>
          <h1 className="text-3xl font-bold text-[var(--sd-text)]">
            {isSetup ? 'Set PIN' : 'Enter PIN'}
          </h1>
          <p className="text-[var(--sd-muted)] mt-2">
            {isSetup
              ? 'Create a 4-6 digit PIN to secure your notes'
              : 'Enter your PIN to access your notes'}
          </p>
        </div>

        <div className="space-y-4">
          {/* First PIN Input */}
          <div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '')
                setPin(val)
                if (error) setError('')
              }}
              placeholder={isSetup ? 'Enter PIN (4-6 digits)' : 'PIN'}
              className="w-full px-4 py-3 rounded-lg border border-white/[0.06] bg-[var(--sd-panel)] text-[var(--sd-text)] text-center text-2xl tracking-widest font-mono outline-none focus:border-[var(--sd-accent)] transition"
              autoFocus
            />
          </div>

          {/* Confirm PIN Input (Setup only) */}
          {isSetup && (
            <div>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={confirmPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '')
                  setConfirmPin(val)
                  if (error) setError('')
                }}
                placeholder="Confirm PIN"
                className="w-full px-4 py-3 rounded-lg border border-white/[0.06] bg-[var(--sd-panel)] text-[var(--sd-text)] text-center text-2xl tracking-widest font-mono outline-none focus:border-[var(--sd-accent)] transition"
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Main Action Button */}
          <button
            onClick={isSetup ? handleSetupPin : handleVerifyPin}
            disabled={pin.length < 4 || (isSetup && confirmPin.length < 4)}
            className="w-full px-4 py-3 rounded-lg bg-[var(--sd-accent)] text-[var(--sd-accent-contrast)] font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          >
            {isSetup ? '✓ Create PIN' : '🔓 Unlock'}
          </button>

          {/* Forgot PIN Button (Verify Mode) */}
          {!isSetup && (
            <button
              onClick={handleForgotPin}
              className="w-full px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition text-sm"
            >
              🚨 Forgot PIN? (Lock All Notes)
            </button>
          )}
        </div>

        {/* Security Info */}
        <div className="mt-8 p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          <p className="text-xs text-[var(--sd-muted)] leading-relaxed">
            <strong>🔒 Security:</strong> Your PIN is stored securely using SHA256 hashing. Only you can access your notes.
          </p>
        </div>
      </div>
    </div>
  )
}
