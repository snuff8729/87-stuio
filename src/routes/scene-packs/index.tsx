import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { listScenePacks, createScenePack, deleteScenePack } from '@/server/functions/scene-packs'

export const Route = createFileRoute('/scene-packs/')({
  loader: () => listScenePacks(),
  component: ScenePacksPage,
})

function ScenePacksPage() {
  const packs = Route.useLoaderData()
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)

  async function handleCreate() {
    if (!name.trim()) return
    await createScenePack({ data: { name: name.trim(), description: description.trim() || undefined } })
    setName('')
    setDescription('')
    setShowCreate(false)
    router.invalidate()
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this scene pack and all its scenes?')) return
    setDeleting(id)
    await deleteScenePack({ data: id })
    setDeleting(null)
    router.invalidate()
  }

  return (
    <div>
      <PageHeader
        title="Scene Packs"
        description="Manage reusable pose/gesture preset collections"
        actions={
          <Button onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : 'New Pack'}
          </Button>
        }
      />

      {showCreate && (
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pack-name">Name</Label>
              <Input
                id="pack-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Basic Emotions"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pack-desc">Description (optional)</Label>
              <Textarea
                id="pack-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this scene pack..."
                rows={2}
              />
            </div>
            <Button onClick={handleCreate} disabled={!name.trim()}>
              Create
            </Button>
          </CardContent>
        </Card>
      )}

      {packs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">No scene packs yet</p>
          <p className="text-sm">Create your first scene pack to define pose/gesture presets.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packs.map((pack) => (
            <Card key={pack.id} className="group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <Link to="/scene-packs/$scenePackId" params={{ scenePackId: String(pack.id) }}>
                    <CardTitle className="text-base hover:text-primary transition-colors cursor-pointer">
                      {pack.name}
                    </CardTitle>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDelete(pack.id)}
                    disabled={deleting === pack.id}
                    className="opacity-0 group-hover:opacity-100 text-destructive"
                  >
                    &times;
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {pack.description || 'No description'}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Created {new Date(pack.createdAt!).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
