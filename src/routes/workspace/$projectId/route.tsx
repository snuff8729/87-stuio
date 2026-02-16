import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/workspace/$projectId')({
  component: () => <Outlet />,
})
