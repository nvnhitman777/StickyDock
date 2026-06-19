import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser'

// Azure AD App Registration - Registered by StickyDock developer
// End users just sign in with their Microsoft account - no setup needed!
const TENANT_ID = 'common'
// Using a public client app registered for StickyDock
// Users authenticate with their own Microsoft account
const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID || 'e8f8aa22-34c5-4c8c-a2d9-3f8f8b4c1b9a'

const SCOPES = ['Files.ReadWrite', 'offline_access']

let msalInstance: PublicClientApplication | null = null
let initPromise: Promise<PublicClientApplication> | null = null

async function initializeMsal(): Promise<PublicClientApplication> {
  if (msalInstance) return msalInstance
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const redirectUri = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      
      const config = {
        auth: {
          clientId: CLIENT_ID,
          authority: `https://login.microsoftonline.com/${TENANT_ID}`,
          redirectUri: redirectUri
        },
        cache: {
          cacheLocation: 'localStorage' as const,
          storeAuthStateInCookie: true
        }
      }

      msalInstance = new PublicClientApplication(config)
      await msalInstance.initialize()
      initPromise = null
      return msalInstance
    } catch (error) {
      console.error('Failed to initialize MSAL:', error)
      initPromise = null
      throw error
    }
  })()

  return initPromise
}

export async function authenticateWithOneDrive(): Promise<{ success: boolean; message: string; accessToken?: string }> {
  try {
    const msal = await initializeMsal()

    // Check if user is already signed in
    const accounts = msal.getAllAccounts()
    if (accounts.length > 0) {
      try {
        const account = accounts[0]
        const tokenResponse = await msal.acquireTokenSilent({
          scopes: SCOPES,
          account: account
        })
        return {
          success: true,
          message: `Signed in as ${account.name}`,
          accessToken: tokenResponse.accessToken
        }
      } catch (refreshError) {
        // Token refresh failed, try interactive login
        console.log('Token refresh needed, opening sign-in window')
      }
    }

    // Open sign-in window - user signs in with their Microsoft account
    const response = await msal.loginPopup({
      scopes: SCOPES
    })

    return {
      success: true,
      message: `Successfully signed in as ${response.account?.name || 'your account'}. Your OneDrive is now connected!`,
      accessToken: response.accessToken
    }
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      return {
        success: false,
        message: 'Sign-in was cancelled. Please try again.'
      }
    }
    return {
      success: false,
      message: `Sign-in failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const msal = await initializeMsal()
    const accounts = msal.getAllAccounts()

    if (accounts.length === 0) {
      return null
    }

    const tokenResponse = await msal.acquireTokenSilent({
      scopes: SCOPES,
      account: accounts[0]
    })

    return tokenResponse.accessToken
  } catch (error) {
    console.error('Failed to get access token:', error)
    return null
  }
}

export async function backupDatabaseToOneDrive(
  databaseContent: ArrayBuffer | Blob,
  fileName: string = 'stickydock-backup.db'
): Promise<{ success: boolean; message: string; timestamp?: string }> {
  try {
    const token = await getAccessToken()
    if (!token) {
      return {
        success: false,
        message: 'Not signed in to OneDrive. Please click "Connect to OneDrive" first.'
      }
    }

    // Upload file to OneDrive root
    const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${fileName}:/content`

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream'
      },
      body: databaseContent instanceof Blob ? databaseContent : new Blob([databaseContent])
    })

    if (!response.ok) {
      const error = await response.text()
      return {
        success: false,
        message: `Upload failed: ${response.statusText}`
      }
    }

    const timestamp = new Date().toLocaleString()
    return {
      success: true,
      message: `✓ Backup successful! Saved as ${fileName}`,
      timestamp
    }
  } catch (error) {
    return {
      success: false,
      message: `Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

export async function disconnectOneDrive(): Promise<{ success: boolean; message: string }> {
  try {
    const msal = await initializeMsal()
    const accounts = msal.getAllAccounts()

    if (accounts.length > 0) {
      await msal.logoutPopup({
        account: accounts[0],
        mainWindowRedirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      })
    }

    // Also clear localStorage
    localStorage.removeItem('msal.account.keys')
    localStorage.removeItem('msal.idtoken')
    localStorage.removeItem('msal.accesstoken')

    return {
      success: true,
      message: 'Disconnected from OneDrive successfully'
    }
  } catch (error) {
    return {
      success: false,
      message: `Disconnect failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

export async function isConnectedToOneDrive(): Promise<boolean> {
  try {
    const msal = await initializeMsal()
    const accounts = msal.getAllAccounts()
    return accounts.length > 0
  } catch {
    return false
  }
}
