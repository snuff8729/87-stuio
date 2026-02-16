import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { getScenePageContext } from '@/server/functions/workspace'
import { updateProjectScene } from '@/server/functions/project-scenes'
import { SceneDetail } from '@/components/workspace/scene-detail'

export const Route = createFileRoute('/workspace/$projectId/scenes/$sceneId')({
  loader: async ({ params }) => {
    return getScenePageContext({
      data: {
        projectId: Number(params.projectId),
        sceneId: Number(params.sceneId),
      },
    })
  },
  component: SceneDetailPage,
})

function SceneDetailPage() {
  const data = Route.useLoaderData()
  const params = Route.useParams()
  const router = useRouter()
  const projectId = Number(params.projectId)
  const sceneId = Number(params.sceneId)

  function handleThumbnailChange(imageId: number | null) {
    updateProjectScene({ data: { id: sceneId, thumbnailImageId: imageId } })
      .then(() => router.invalidate())
      .catch(() => toast.error('Failed to update thumbnail'))
  }

  return (
    <div className="h-dvh flex flex-col">
      {/* Header */}
      <header className="h-12 border-b border-border bg-background flex items-center px-3 shrink-0 gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link
            to="/workspace/$projectId"
            params={{ projectId: String(projectId) }}
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />
            <span className="hidden sm:inline">{data.project.name}</span>
          </Link>
        </Button>
        <div className="h-4 w-px bg-border" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{data.packName}</div>
          <h1 className="text-sm font-semibold truncate">{data.sceneName}</h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <SceneDetail
          sceneId={sceneId}
          characters={data.characters}
          generalPrompt={data.project.generalPrompt ?? ''}
          projectId={projectId}
          thumbnailImageId={data.thumbnailImageId}
          onThumbnailChange={handleThumbnailChange}
        />
      </main>
    </div>
  )
}
