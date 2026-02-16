import { SceneList } from './scene-list'

interface ScenePanelProps {
  scenePacks: Array<{
    id: number
    name: string
    scenes: Array<{
      id: number
      name: string
      placeholders: string | null
      sortOrder: number | null
      recentImageCount: number
      thumbnailPath: string | null
      thumbnailImageId: number | null
    }>
  }>
  projectId: number
  sceneCounts: Record<number, number>
  defaultCount: number
  onSceneCountChange: (sceneId: number, count: number | null) => void
}

export function ScenePanel({
  scenePacks,
  projectId,
  sceneCounts,
  defaultCount,
  onSceneCountChange,
}: ScenePanelProps) {
  return (
    <SceneList
      scenePacks={scenePacks}
      projectId={projectId}
      sceneCounts={sceneCounts}
      defaultCount={defaultCount}
      onSceneCountChange={onSceneCountChange}
    />
  )
}
