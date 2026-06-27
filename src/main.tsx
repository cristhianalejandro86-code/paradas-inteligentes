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
import { GanttPage } from './pages/GanttPage'
import { RutaCriticaPage } from './pages/RutaCriticaPage'
import { RecursosPage } from './pages/RecursosPage'

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
          { path: 'gantt', element: <GanttPage /> },
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
