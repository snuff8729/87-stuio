import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import {
  Home03Icon,
  FolderOpenIcon,
  Film02Icon,
  Image02Icon,
  TaskDaily02Icon,
  Settings02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: Home03Icon },
  { to: '/projects', label: 'Projects', icon: FolderOpenIcon },
  { to: '/scene-packs', label: 'Scene Packs', icon: Film02Icon },
  { to: '/gallery', label: 'Gallery', icon: Image02Icon },
  { to: '/jobs', label: 'Jobs', icon: TaskDaily02Icon },
  { to: '/settings', label: 'Settings', icon: Settings02Icon },
] as const

export function Sidebar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <div className="size-7 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-xs font-bold text-primary-foreground">87</span>
        </div>
        <span className="font-semibold text-sidebar-foreground">Studio</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive =
            item.to === '/' ? currentPath === '/' : currentPath.startsWith(item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <HugeiconsIcon icon={item.icon} className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
