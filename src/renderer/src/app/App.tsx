import { useEffect, useState, type JSX } from 'react'
import NoteDock from '@/features/notes/NoteDock'
import type { AuthState } from '@/types/domain'

export default function App(): JSX.Element {
  const [authState, setAuthState] = useState<AuthState | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadAuthState() {
      try {
        console.log('[Auth] Loading auth state...')
        const state = await (window as any).go.main.App.GetAuthStatus()
        console.log('[Auth] State loaded:', {
          isLocked: state.isLocked,
          hasPIN: state.hasPIN,
          isAuthenticated: state.isAuthenticated
        })
        setAuthState(state)
      } catch (err) {
        console.error('[Auth] Error loading auth state:', err)
        // On error, set default state
        setAuthState({
          isLocked: false,
          hasPIN: false,
          isAuthenticated: false
        })
      } finally {
        setIsLoading(false)
      }
    }

    void loadAuthState()
  }, [])

  if (isLoading || authState === null) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-[var(--sd-bg)]">
        <div className="text-[var(--sd-muted)]">Loading...</div>
      </div>
    )
  }

  // Pass authState to NoteDock - it will handle auth flow after workspace selection
  return <NoteDock authState={authState} onSetAuthState={setAuthState} />
}
