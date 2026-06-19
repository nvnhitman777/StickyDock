import { useState, type JSX } from 'react'
import { motion } from 'framer-motion'
import type { AuthState } from '@/types/domain'

type LockConfirmModalProps = {
  isOpen: boolean
  authState: AuthState
  onClose: () => void
  onLocked: () => void
}

export function LockConfirmModal({ isOpen, authState, onClose, onLocked }: LockConfirmModalProps): JSX.Element | null {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  if (!isOpen) {
    return null
  }

  const isFirstTime = !authState.hasPIN

  async function handleLock() {
    if (isFirstTime) {
      // Validate PIN format
      if (pin.length < 4 || pin.length > 6) {
        setError('PIN must be 4-6 digits')
        return
      }

      if (pin !== confirmPin) {
        setError('PINs do not match')
        return
      }

      // Set PIN and lock
      setIsLoading(true)
      try {
        console.log('[Lock] Setting PIN...')
        const result = await (window as any).go.main.App.SetPINCode(pin)
        console.log('[Lock] SetPINCode result:', result)
        if (result) {
          // PIN set successfully, now lock
          console.log('[Lock] Locking database...')
          const lockResult = await (window as any).go.main.App.LockDatabase()
          console.log('[Lock] LockDatabase result:', lockResult)
          setError('')
          setPin('')
          setConfirmPin('')
          console.log('[Lock] Calling onLocked callback...')
          onLocked()
        } else {
          setError('Failed to set PIN')
        }
      } catch (err) {
        console.error('[Lock] Error:', err)
        setError('Error setting PIN')
      } finally {
        setIsLoading(false)
      }
    } else {
      // User already has PIN, just lock
      setIsLoading(true)
      try {
        console.log('[Lock] Locking database (existing PIN)...')
        const lockResult = await (window as any).go.main.App.LockDatabase()
        console.log('[Lock] LockDatabase result:', lockResult)
        console.log('[Lock] Calling onLocked callback...')
        onLocked()
      } catch (err) {
        console.error('[Lock] Error:', err)
        setError('Failed to lock')
      } finally {
        setIsLoading(false)
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-[28px] border border-white/[0.08] bg-[rgba(11,15,20,0.98)] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      >
        <div className="border-b border-white/[0.06] px-6 py-5">
          <h2 className="text-lg font-semibold text-[var(--sd-text)]">
            {isFirstTime ? '🔐 Lock & Secure Notes' : '🔒 Lock Notes'}
          </h2>
          <p className="mt-2 text-sm text-[var(--sd-muted)]">
            {isFirstTime
              ? 'Create a PIN to secure your notes before locking'
              : 'Your notes will be locked and require your PIN to access'}
          </p>
        </div>

        <div className="space-y-4 p-6">
          {isFirstTime && (
            <>
              <div>
                <label className="block text-xs font-medium text-[var(--sd-text)] mb-2">
                  Create PIN (4-6 digits)
                </label>
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
                  placeholder="Enter 4-6 digits"
                  className="w-full px-4 py-2 rounded-lg border border-white/[0.06] bg-[var(--sd-panel)] text-[var(--sd-text)] text-center text-2xl tracking-widest font-mono outline-none focus:border-[var(--sd-accent)] transition"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--sd-text)] mb-2">
                  Confirm PIN
                </label>
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
                  className="w-full px-4 py-2 rounded-lg border border-white/[0.06] bg-[var(--sd-panel)] text-[var(--sd-text)] text-center text-2xl tracking-widest font-mono outline-none focus:border-[var(--sd-accent)] transition"
                />
              </div>
            </>
          )}

          {error && (
            <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.04] p-3">
            <p className="text-xs text-[var(--sd-muted)]">
              <strong>📌 After Locking:</strong>
              <br />
              • App will close
              <br />
              • Next launch requires PIN
              <br />
              • Notes fully protected
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-white/[0.06] bg-white/[0.04] text-[var(--sd-text)] font-medium transition hover:bg-white/[0.08]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleLock()}
              disabled={isLoading || (isFirstTime && (pin.length < 4 || confirmPin.length < 4))}
              className="flex-1 px-4 py-2 rounded-lg bg-[var(--sd-accent)] text-[var(--sd-accent-contrast)] font-medium transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Locking...' : isFirstTime ? 'Set PIN & Lock' : 'Lock Now'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
