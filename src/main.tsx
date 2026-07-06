import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './lib/auth'
import { AuthGate } from './components/AuthGate'
import { RootLayout } from './components/RootLayout'
import { Dashboard } from './pages/Dashboard'
import { ParadaLayout } from './pages/ParadaLayout'
import { KanbanPage } from './pages/KanbanPage'
import { TablaPage } from './pages/TablaPage'
import { GanttPage } from './pages/GanttPage'
import { CuadrillasPage } from './pages/CuadrillasPage'
import { RutaCriticaPage } from './pages/RutaCriticaPage'
import { RecursosPage } from './pages/RecursosPage'
import { PreparacionPage } from './pages/PreparacionPage'
import { AndamiosPage } from './pages/AndamiosPage'
import { SoldadorasPage } from './pages/SoldadorasPage'
import { GruaPage } from './pages/GruaPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      {
        path: 'parada/:id',
        element: <ParadaLayout />,
        children: [
          { index: true, element: <KanbanPage /> },
          { path: 'lista', element: <TablaPage /> },
          { path: 'gantt', element: <GanttPage /> },
          { path: 'cuadrillas', element: <CuadrillasPage /> },
          { path: 'preparacion', element: <PreparacionPage /> },
          { path: 'andamios', element: <AndamiosPage /> },
          { path: 'soldadoras', element: <SoldadorasPage /> },
          { path: 'grua', element: <GruaPage /> },
          { path: 'ruta-critica', element: <RutaCriticaPage /> },
          { path: 'recursos', element: <RecursosPage /> },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
