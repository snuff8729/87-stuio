import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getScenePack, updateScenePack } from '@/server/functions/scene-packs'
import { createScene, updateScene, deleteScene } from '@/server/functions/scenes'
import { extractPlaceholders } from '@/lib/placeholder'

export const Route = createFileRoute('/scene-packs/$scenePackId')({
  loader: ({ params }) => getScenePack({ data: Number(params.scenePackId) }),
  component: ScenePackDetailPage,
})

function ScenePackDetailPage() {
  const pack = Route.useLoaderData()
  const router = useRouter()
  const [editingName, setEditingName] = useState(false)
  const [packName, setPackName] = useState(pack.name)
  const [showAddScene, setShowAddScene] = useState(false)
  const [newSceneName, setNewSceneName] = useState('')

  async function handleUpdatePackName() {
    if (!packName.trim()) return
    await updateScenePack({ data: { id: pack.id, name: packName.trim() } })
    setEditingName(false)
    router.invalidate()
  }

  async function handleAddScene() {
    if (!newSceneName.trim()) return
    await createScene({ data: { scenePackId: pack.id, name: newSceneName.trim() } })
    setNewSceneName('')
    setShowAddScene(false)
    router.invalidate()
  }

  async function handleDeleteScene(id: number) {
    if (!confirm('Delete this scene?')) return
    await deleteScene({ data: id })
    router.invalidate()
  }

  return (
    <div>
      <PageHeader
        title={
          editingName ? (
            <span className="inline-flex gap-2 items-center">
              <Input
                value={packName}
                onChange={(e) => setPackName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUpdatePackName()}
                className="w-64"
                autoFocus
              />
              <Button size="sm" onClick={handleUpdatePackName}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingName(false); setPackName(pack.name) }}>Cancel</Button>
            </span>
          ) as unknown as string : pack.name
        }
        description={pack.description || undefined}
        actions={
          <div className="flex gap-2">
            {!editingName && (
              <Button variant="outline" onClick={() => setEditingName(true)}>
                Rename
              </Button>
            )}
            <Button onClick={() => setShowAddScene(!showAddScene)}>
              {showAddScene ? 'Cancel' : 'Add Scene'}
            </Button>
          </div>
        }
      />

      {showAddScene && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <Input
                value={newSceneName}
                onChange={(e) => setNewSceneName(e.target.value)}
                placeholder="Scene name (e.g. Smiling)"
                onKeyDown={(e) => e.key === 'Enter' && handleAddScene()}
              />
              <Button onClick={handleAddScene} disabled={!newSceneName.trim()}>
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {pack.scenes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">No scenes yet</p>
          <p className="text-sm">Add scenes to define pose/gesture presets with placeholder values.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pack.scenes.map((scene) => (
            <SceneCard key={scene.id} scene={scene} onDelete={() => handleDeleteScene(scene.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

interface SceneCardProps {
  scene: {
    id: number
    name: string
    description: string | null
    placeholders: string | null
  }
  onDelete: () => void
}

function SceneCard({ scene, onDelete }: SceneCardProps) {
  const router = useRouter()
  const placeholders: Record<string, string> = JSON.parse(scene.placeholders || '{}')
  const keys = Object.keys(placeholders)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(scene.name)
  const [description, setDescription] = useState(scene.description ?? '')
  const [values, setValues] = useState(placeholders)
  const [newKey, setNewKey] = useState('')

  async function handleSave() {
    await updateScene({
      data: {
        id: scene.id,
        name: name.trim() || scene.name,
        description: description.trim() || undefined,
        placeholders: JSON.stringify(values),
      },
    })
    setEditing(false)
    router.invalidate()
  }

  function handleAddKey() {
    const k = newKey.trim()
    if (!k || values[k] !== undefined) return
    setValues({ ...values, [k]: '' })
    setNewKey('')
  }

  function handleRemoveKey(key: string) {
    const next = { ...values }
    delete next[key]
    setValues(next)
  }

  if (!editing) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium">{scene.name}</h3>
                {keys.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {keys.length} placeholder{keys.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {scene.description && (
                <p className="text-sm text-muted-foreground mb-2">{scene.description}</p>
              )}
              {keys.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {keys.map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs"
                    >
                      <span className="text-muted-foreground">{`{{${k}}}`}</span>
                      <span className="text-foreground">{placeholders[k] || '(empty)'}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-primary/50">
      <CardContent className="pt-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <Label>Placeholders</Label>
          {Object.entries(values).map(([key, val]) => (
            <div key={key} className="flex gap-2 items-center">
              <span className="text-sm font-mono text-muted-foreground min-w-24">{`{{${key}}}`}</span>
              <Input
                value={val}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                placeholder={`Value for ${key}`}
                className="flex-1"
              />
              <Button variant="ghost" size="icon-xs" onClick={() => handleRemoveKey(key)} className="text-destructive">
                &times;
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="New placeholder key"
              onKeyDown={(e) => e.key === 'Enter' && handleAddKey()}
              className="w-48"
            />
            <Button variant="outline" size="sm" onClick={handleAddKey} disabled={!newKey.trim()}>
              Add Key
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave}>Save</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setEditing(false)
              setName(scene.name)
              setDescription(scene.description ?? '')
              setValues(placeholders)
            }}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
