import { supabase } from '@/lib/supabase'

export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  github_username?: string
  bio?: string
  created_at: string
  updated_at: string
}

export interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

class AuthService {
  private currentUser: User | null = null
  private listeners: ((state: AuthState) => void)[] = []

  constructor() {
    this.initializeAuth()
  }

  private async initializeAuth() {
    // Get initial session
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await this.loadUserProfile(session.user.id)
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await this.loadUserProfile(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        this.currentUser = null
        this.notifyListeners()
      }
    })
  }

  private async loadUserProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error loading user profile:', error)
        return
      }

      this.currentUser = data
      this.notifyListeners()
    } catch (error) {
      console.error('Error loading user profile:', error)
    }
  }

  async signUp(email: string, password: string, name: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.setLoading(true)
      this.setError(null)

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name
          }
        }
      })

      if (error) {
        this.setError(error.message)
        return { success: false, error: error.message }
      }

      if (data.user) {
        // Create user profile
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            id: data.user.id,
            email: data.user.email!,
            name: name,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })

        if (profileError) {
          console.error('Error creating user profile:', profileError)
        }
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred'
      this.setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      this.setLoading(false)
    }
  }

  async signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.setLoading(true)
      this.setError(null)

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        this.setError(error.message)
        return { success: false, error: error.message }
      }

      if (data.user) {
        await this.loadUserProfile(data.user.id)
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred'
      this.setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      this.setLoading(false)
    }
  }

  async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut()
      this.currentUser = null
      this.notifyListeners()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  async updateProfile(updates: Partial<User>): Promise<{ success: boolean; error?: string }> {
    if (!this.currentUser) {
      return { success: false, error: 'No user logged in' }
    }

    try {
      this.setLoading(true)
      this.setError(null)

      const { error } = await supabase
        .from('users')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.currentUser.id)

      if (error) {
        this.setError(error.message)
        return { success: false, error: error.message }
      }

      // Update local user data
      this.currentUser = { ...this.currentUser, ...updates }
      this.notifyListeners()

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred'
      this.setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      this.setLoading(false)
    }
  }

  // State management
  private loading = false
  private error: string | null = null

  private setLoading(loading: boolean) {
    this.loading = loading
    this.notifyListeners()
  }

  private setError(error: string | null) {
    this.error = error
    this.notifyListeners()
  }

  getState(): AuthState {
    return {
      user: this.currentUser,
      loading: this.loading,
      error: this.error
    }
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener)
    listener(this.getState())

    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  private notifyListeners() {
    const state = this.getState()
    this.listeners.forEach(listener => listener(state))
  }

  // Utility methods
  isAuthenticated(): boolean {
    return this.currentUser !== null
  }

  getCurrentUser(): User | null {
    return this.currentUser
  }
}

export const authService = new AuthService() 