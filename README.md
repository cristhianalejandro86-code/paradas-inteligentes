# Paradas Inteligentes

App web para gestión de paradas mecánicas en plantas de beneficio (minería). Supera a MSProject/Primavera en coordinación de paradas: Kanban visual, ruta crítica, gestión de recursos y déficit, en tiempo real.

> Estado: **MVP v1** · Fase 4 (Construcción). Frontend funcional conectado a Supabase.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS v4
- **Drag-drop:** @dnd-kit
- **Ruteo:** react-router-dom
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime + RLS)
- **Hosting:** Vercel

## Funcionalidad actual

- **Dashboard** de paradas con avance por tarea.
- **Kanban** por parada (Por Hacer → En Progreso → En Revisión → Completada) con **drag-drop que persiste** el estado en Supabase.
- **Ruta crítica:** avance general + ranking de tareas críticas que ponen en riesgo la parada.
- **Recursos / Demanda 24h:** inventario con stock, estado, urgencia y déficit; export CSV.

## Correr en local

```bash
npm install
cp .env.example .env.local   # y completar con las credenciales de Supabase
npm run dev                  # http://localhost:5173
```

Variables de entorno (`.env.local`):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key>
```

Se obtienen en el dashboard de Supabase → Project Settings → API.

## Build de producción

```bash
npm run build      # genera dist/
npm run preview    # sirve dist/ localmente para verificar
```

## Deploy a Vercel

El proyecto incluye `vercel.json` (framework Vite + rewrites para SPA). Con la CLI de Vercel autenticada:

```bash
# 1. Enlazar (crea el proyecto en tu cuenta)
vercel link --yes

# 2. Configurar variables de entorno (production y preview)
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production

# 3. Desplegar a producción
vercel --prod
```

## Base de datos

El esquema vive en el proyecto Supabase `paradas-inteligentes`. Migraciones aplicadas:

1. `core_schema_paradas_v1` — enums + `usuario`, `parada`, `tarea`, `recurso` + RLS.
2. `seed_demo_reactor2` — datos demo (parada "Mantenimiento Reactor 2").
3. `rls_write_tarea_mvp` — política de escritura MVP para mover tarjetas.

> **Nota de seguridad (MVP):** las políticas RLS actuales permiten lectura pública y escritura de tareas a `anon`. Se reemplazarán por políticas por rol (Jefe/Supervisor/Técnico/Coordinador) en el incremento de Auth con Supabase Auth.

## Roadmap próximo

- Autenticación (Supabase Auth) + RLS por rol.
- Registro de avance en piso (foto a Supabase Storage).
- Alertas en tiempo real (Supabase Realtime / pg_cron).
- Standup de cambio de turno + firma digital.
- Validación bloqueante de capacitación (ITER 2).
