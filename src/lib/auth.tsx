import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface Perfil {
  id: string
  nombre: string
  rol: string
}

interface AuthContextValue {
  session: Session | null
  perfil: Perfil | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  perfil: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Trae el perfil (nombre + rol) desde la tabla usuario por email.
  useEffect(() => {
    const email = session?.user?.email
    if (!email) {
      setPerfil(null)
      return
    }
    supabase
      .from('usuario')
      .select('id, nombre, rol')
      .eq('email', email)
      .maybeSingle()
      .then(({ data }) => setPerfil((data as Perfil) ?? null))
    // Solo refetch cuando cambia el email, no en cada refresh de token.
  }, [session?.user?.email])

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, perfil, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
