import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getProject, updateProject, assignScenePack, removeProjectScenePack } from '@/server/functions/projects'
import { listCharacters, createCharacter, updateCharacter, deleteCharacter } from '@/server/functions/characters'
import { listProjectScenePacks, updateProjectScene, upsertCharacterOverride, getCharacterOverrides } from '@/server/functions/project-scenes'
import { listScenePacks } from '@/server/functions/scene-packs'
import { extractPlaceholders } from '@/lib/placeholder'
import { createGenerationJob } from '@/server/functions/generation'
import { lazy, Suspense } from 'react'

const PromptEditor = lazy(() =>
  import('@/components/prompt-editor/prompt-editor').then((m) => ({
    default: m.PromptEditor,
  })),
)

function LazyPromptEditor(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: string
}) {
  return (
    <Suspense
      fallback={
        <Textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          className="font-mono text-sm"
          rows={4}
        />
      }
    >
      <PromptEditor {...props} />
    </Suspense>
  )
}

export const Route = createFileRoute('/projects/$projectId')({
  loader: async ({ params }) => {
    const id = Number(params.projectId)
    const [project, chars, pScenePacks, globalPacks] = await Promise.all([
      getProject({ data: id }),
      listCharacters({ data: id }),
      listProjectScenePacks({ data: id }),
      listScenePacks(),
    ])
    return { project, characters: chars, projectScenePacks: pScenePacks, globalPacks }
  },
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { project, characters: chars, projectScenePacks: pScenePacks, globalPacks } =
    Route.useLoaderData()
  const router = useRouter()

  const [generalPrompt, setGeneralPrompt] = useState(project.generalPrompt ?? '')
  const [negativePrompt, setNegativePrompt] = useState(project.negativePrompt ?? '')
  const [params, setParams] = useState<Record<string, unknown>>(
    JSON.parse(project.parameters || '{}'),
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setGeneralPrompt(project.generalPrompt ?? '')
    setNegativePrompt(project.negativePrompt ?? '')
    setParams(JSON.parse(project.parameters || '{}'))
  }, [project])

  const generalPlaceholders = extractPlaceholders(generalPrompt)
  const allCharPlaceholders = chars.flatMap((c) => [
    ...extractPlaceholders(c.charPrompt),
    ...extractPlaceholders(c.charNegative),
  ])
  const uniqueCharPlaceholders = [...new Set(allCharPlaceholders)]

  async function handleSavePrompts() {
    setSaving(true)
    await updateProject({
      data: {
        id: project.id,
        generalPrompt,
        negativePrompt,
        parameters: JSON.stringify(params),
      },
    })
    setSaving(false)
    router.invalidate()
  }

  return (
    <div>
      <PageHeader
        title={project.name}
        description={project.description || undefined}
        actions={
          <Button onClick={handleSavePrompts} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Prompts Section */}
        <Card>
          <CardHeader>
            <CardTitle>Prompts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>General Prompt</Label>
              <LazyPromptEditor
                value={generalPrompt}
                onChange={setGeneralPrompt}
                placeholder="Enter general prompt with {{placeholders}}..."
                minHeight="100px"
              />
              {generalPlaceholders.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {generalPlaceholders.map((p) => (
                    <Badge key={p} variant="secondary">{`{{${p}}}`}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Negative Prompt</Label>
              <LazyPromptEditor
                value={negativePrompt}
                onChange={setNegativePrompt}
                placeholder="Enter negative prompt..."
                minHeight="80px"
              />
            </div>
          </CardContent>
        </Card>

        {/* Parameters Section */}
        <Card>
          <CardHeader>
            <CardTitle>Generation Parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <ParameterForm params={params} onChange={setParams} />
          </CardContent>
        </Card>

        {/* Characters Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Characters</CardTitle>
              <AddCharacterButton projectId={project.id} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {chars.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No characters yet. Add a character slot for multi-character images.
              </p>
            ) : (
              chars.map((char) => (
                <CharacterSlot key={char.id} character={char} />
              ))
            )}
          </CardContent>
        </Card>

        {/* Scene Packs Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Scene Packs</CardTitle>
              <AssignScenePackButton
                projectId={project.id}
                globalPacks={globalPacks}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {pScenePacks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No scene packs assigned. Assign a global scene pack to create a snapshot.
              </p>
            ) : (
              pScenePacks.map((psp) => (
                <ProjectScenePackSection
                  key={psp.id}
                  projectScenePack={psp}
                  characters={chars}
                  generalPlaceholders={generalPlaceholders}
                  charPlaceholders={uniqueCharPlaceholders}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* Generation Section */}
        <GenerateSection
          projectId={project.id}
          projectScenePacks={pScenePacks}
        />
      </div>
    </div>
  )
}

// ─── Generate Section ───────────────────────────────────────────────────────

function GenerateSection({
  projectId,
  projectScenePacks,
}: {
  projectId: number
  projectScenePacks: Array<{
    id: number
    name: string
    scenes: Array<{ id: number; name: string }>
  }>
}) {
  const router = useRouter()
  const allScenes = projectScenePacks.flatMap((psp) =>
    psp.scenes.map((s) => ({ ...s, packName: psp.name })),
  )
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<number>>(new Set())
  const [count, setCount] = useState(1)
  const [generating, setGenerating] = useState(false)

  function toggleScene(id: number) {
    setSelectedSceneIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedSceneIds(new Set(allScenes.map((s) => s.id)))
  }

  async function handleGenerate() {
    if (selectedSceneIds.size === 0) return
    setGenerating(true)
    await createGenerationJob({
      data: {
        projectId,
        projectSceneIds: [...selectedSceneIds],
        countPerScene: count,
      },
    })
    setGenerating(false)
    router.navigate({ to: '/jobs' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Images</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {allScenes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Assign a scene pack first to enable generation.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Select Scenes</Label>
                <Button variant="ghost" size="xs" onClick={selectAll}>
                  Select All
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {allScenes.map((scene) => (
                  <button
                    key={scene.id}
                    onClick={() => toggleScene(scene.id)}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      selectedSceneIds.has(scene.id)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary/50 border-border hover:bg-secondary'
                    }`}
                  >
                    {scene.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Count per scene</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
                  className="w-24"
                />
              </div>
              <div className="pt-5">
                <span className="text-sm text-muted-foreground">
                  Total: {selectedSceneIds.size * count} images
                </span>
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generating || selectedSceneIds.size === 0}
            >
              {generating ? 'Starting...' : `Generate ${selectedSceneIds.size * count} Images`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Parameter Form ─────────────────────────────────────────────────────────

function ParameterForm({
  params,
  onChange,
}: {
  params: Record<string, unknown>
  onChange: (p: Record<string, unknown>) => void
}) {
  function set(key: string, value: unknown) {
    onChange({ ...params, [key]: value })
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <div className="space-y-1">
        <Label className="text-xs">Width</Label>
        <Input
          type="number"
          value={String(params.width ?? 832)}
          onChange={(e) => set('width', Number(e.target.value))}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Height</Label>
        <Input
          type="number"
          value={String(params.height ?? 1216)}
          onChange={(e) => set('height', Number(e.target.value))}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Steps</Label>
        <Input
          type="number"
          value={String(params.steps ?? 28)}
          onChange={(e) => set('steps', Number(e.target.value))}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">CFG Scale</Label>
        <Input
          type="number"
          step="0.1"
          value={String(params.cfg_scale ?? 5)}
          onChange={(e) => set('cfg_scale', Number(e.target.value))}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">CFG Rescale</Label>
        <Input
          type="number"
          step="0.01"
          value={String(params.cfg_rescale ?? 0)}
          onChange={(e) => set('cfg_rescale', Number(e.target.value))}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Sampler</Label>
        <Input
          value={String(params.sampler ?? 'k_euler_ancestral')}
          onChange={(e) => set('sampler', e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Scheduler</Label>
        <Input
          value={String(params.scheduler ?? 'native')}
          onChange={(e) => set('scheduler', e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">UC Preset</Label>
        <Input
          type="number"
          value={String(params.ucPreset ?? 3)}
          onChange={(e) => set('ucPreset', Number(e.target.value))}
        />
      </div>
      <div className="flex items-center gap-2 pt-5">
        <input
          type="checkbox"
          checked={Boolean(params.smea)}
          onChange={(e) => set('smea', e.target.checked)}
          id="smea"
        />
        <Label htmlFor="smea" className="text-xs">SMEA</Label>
      </div>
      <div className="flex items-center gap-2 pt-5">
        <input
          type="checkbox"
          checked={Boolean(params.smea_dyn)}
          onChange={(e) => set('smea_dyn', e.target.checked)}
          id="smea_dyn"
        />
        <Label htmlFor="smea_dyn" className="text-xs">SMEA Dyn</Label>
      </div>
      <div className="flex items-center gap-2 pt-5">
        <input
          type="checkbox"
          checked={Boolean(params.qualityToggle ?? true)}
          onChange={(e) => set('qualityToggle', e.target.checked)}
          id="qualityToggle"
        />
        <Label htmlFor="qualityToggle" className="text-xs">Quality Tags</Label>
      </div>
    </div>
  )
}

// ─── Character Slot ─────────────────────────────────────────────────────────

function CharacterSlot({
  character,
}: {
  character: {
    id: number
    name: string
    charPrompt: string
    charNegative: string
  }
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(character.name)
  const [prompt, setPrompt] = useState(character.charPrompt)
  const [negative, setNegative] = useState(character.charNegative)

  async function handleSave() {
    await updateCharacter({ data: { id: character.id, name, charPrompt: prompt, charNegative: negative } })
    setEditing(false)
    router.invalidate()
  }

  async function handleDelete() {
    if (!confirm(`Delete character "${character.name}"?`)) return
    await deleteCharacter({ data: character.id })
    router.invalidate()
  }

  const placeholders = [
    ...extractPlaceholders(prompt),
    ...extractPlaceholders(negative),
  ]
  const uniquePlaceholders = [...new Set(placeholders)]

  if (!editing) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{character.name}</span>
            {uniquePlaceholders.length > 0 && (
              <div className="flex gap-1">
                {uniquePlaceholders.map((p) => (
                  <Badge key={p} variant="outline" className="text-xs">{`{{${p}}}`}</Badge>
                ))}
              </div>
            )}
          </div>
          {character.charPrompt && (
            <div className="mt-1">
              <span className="text-xs text-muted-foreground/70">Positive: </span>
              <span className="text-xs text-muted-foreground font-mono line-clamp-2">
                {character.charPrompt}
              </span>
            </div>
          )}
          {character.charNegative && (
            <div className="mt-0.5">
              <span className="text-xs text-muted-foreground/70">Negative: </span>
              <span className="text-xs text-muted-foreground font-mono line-clamp-2">
                {character.charNegative}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="ghost" size="xs" className="text-destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 rounded-lg border border-primary/50 space-y-3">
      <div className="space-y-2">
        <Label className="text-xs">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Character Prompt (Positive)</Label>
        <LazyPromptEditor
          value={prompt}
          onChange={setPrompt}
          placeholder="Character prompt with {{placeholders}}..."
          minHeight="80px"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Character Prompt (Negative)</Label>
        <LazyPromptEditor
          value={negative}
          onChange={setNegative}
          placeholder="Negative prompt for this character..."
          minHeight="60px"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave}>Save</Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false)
            setName(character.name)
            setPrompt(character.charPrompt)
            setNegative(character.charNegative)
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ─── Add Character Button ───────────────────────────────────────────────────

function AddCharacterButton({ projectId }: { projectId: number }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  async function handleAdd() {
    if (!name.trim()) return
    await createCharacter({ data: { projectId, name: name.trim() } })
    setName('')
    setAdding(false)
    router.invalidate()
  }

  if (!adding) {
    return (
      <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
        Add Character
      </Button>
    )
  }

  return (
    <div className="flex gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Character name"
        className="w-40"
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        autoFocus
      />
      <Button size="sm" onClick={handleAdd} disabled={!name.trim()}>Add</Button>
      <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
    </div>
  )
}

// ─── Assign Scene Pack Button ───────────────────────────────────────────────

function AssignScenePackButton({
  projectId,
  globalPacks,
}: {
  projectId: number
  globalPacks: Array<{ id: number; name: string }>
}) {
  const router = useRouter()
  const [showPicker, setShowPicker] = useState(false)

  async function handleAssign(scenePackId: number) {
    await assignScenePack({ data: { projectId, scenePackId } })
    setShowPicker(false)
    router.invalidate()
  }

  if (!showPicker) {
    return (
      <Button size="sm" variant="outline" onClick={() => setShowPicker(true)}>
        Assign Pack
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {globalPacks.length === 0 ? (
        <span className="text-sm text-muted-foreground">No global packs available</span>
      ) : (
        globalPacks.map((gp) => (
          <Button key={gp.id} size="sm" variant="outline" onClick={() => handleAssign(gp.id)}>
            {gp.name}
          </Button>
        ))
      )}
      <Button size="sm" variant="ghost" onClick={() => setShowPicker(false)}>
        Cancel
      </Button>
    </div>
  )
}

// ─── Project Scene Pack Section ─────────────────────────────────────────────

function ProjectScenePackSection({
  projectScenePack,
  characters,
  generalPlaceholders,
  charPlaceholders,
}: {
  projectScenePack: {
    id: number
    name: string
    scenes: Array<{
      id: number
      name: string
      placeholders: string | null
    }>
  }
  characters: Array<{ id: number; name: string; charPrompt: string }>
  generalPlaceholders: string[]
  charPlaceholders: string[]
}) {
  const router = useRouter()

  async function handleRemovePack() {
    if (!confirm(`Remove scene pack "${projectScenePack.name}" from this project?`)) return
    await removeProjectScenePack({ data: projectScenePack.id })
    router.invalidate()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">{projectScenePack.name}</h3>
        <Button size="xs" variant="ghost" className="text-destructive" onClick={handleRemovePack}>
          Remove
        </Button>
      </div>
      <div className="space-y-2 pl-3 border-l-2 border-border">
        {projectScenePack.scenes.map((scene) => (
          <ProjectSceneItem
            key={scene.id}
            scene={scene}
            characters={characters}
            generalPlaceholders={generalPlaceholders}
            charPlaceholders={charPlaceholders}
          />
        ))}
      </div>
      <Separator />
    </div>
  )
}

// ─── Project Scene Item ─────────────────────────────────────────────────────

function ProjectSceneItem({
  scene,
  characters,
  generalPlaceholders,
  charPlaceholders,
}: {
  scene: { id: number; name: string; placeholders: string | null }
  characters: Array<{ id: number; name: string }>
  generalPlaceholders: string[]
  charPlaceholders: string[]
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const placeholders: Record<string, string> = JSON.parse(scene.placeholders || '{}')
  const [values, setValues] = useState(placeholders)
  const [charOverrides, setCharOverrides] = useState<Record<number, Record<string, string>>>({})
  const [loaded, setLoaded] = useState(false)

  async function loadOverrides() {
    if (loaded) return
    const overrides = await getCharacterOverrides({ data: scene.id })
    const map: Record<number, Record<string, string>> = {}
    for (const o of overrides) {
      map[o.characterId] = JSON.parse(o.placeholders || '{}')
    }
    setCharOverrides(map)
    setLoaded(true)
  }

  async function handleToggle() {
    if (!expanded) await loadOverrides()
    setExpanded(!expanded)
  }

  async function handleSavePlaceholders() {
    await updateProjectScene({
      data: { id: scene.id, placeholders: JSON.stringify(values) },
    })
    router.invalidate()
  }

  async function handleSaveCharOverride(charId: number) {
    await upsertCharacterOverride({
      data: {
        projectSceneId: scene.id,
        characterId: charId,
        placeholders: JSON.stringify(charOverrides[charId] || {}),
      },
    })
  }

  return (
    <div className="rounded-md bg-secondary/30 p-2">
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm font-medium">{scene.name}</span>
        <span className="text-xs text-muted-foreground">{expanded ? 'Collapse' : 'Expand'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {/* General placeholders */}
          {generalPlaceholders.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">General Placeholders</Label>
              {generalPlaceholders.map((key) => (
                <div key={key} className="flex gap-2 items-center">
                  <span className="text-xs font-mono min-w-20 text-muted-foreground">{`{{${key}}}`}</span>
                  <Input
                    value={values[key] ?? ''}
                    onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                    className="h-7 text-xs"
                    placeholder={`Value for ${key}`}
                  />
                </div>
              ))}
              <Button size="xs" variant="outline" onClick={handleSavePlaceholders}>
                Save
              </Button>
            </div>
          )}

          {/* Character overrides */}
          {characters.length > 0 && charPlaceholders.length > 0 && (
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Character Overrides</Label>
              {characters.map((char) => {
                const overrideVals = charOverrides[char.id] || {}
                return (
                  <div key={char.id} className="space-y-1 pl-2 border-l border-border">
                    <span className="text-xs font-medium">{char.name}</span>
                    {charPlaceholders.map((key) => (
                      <div key={key} className="flex gap-2 items-center">
                        <span className="text-xs font-mono min-w-20 text-muted-foreground">{`{{${key}}}`}</span>
                        <Input
                          value={overrideVals[key] ?? ''}
                          onChange={(e) => {
                            setCharOverrides({
                              ...charOverrides,
                              [char.id]: { ...overrideVals, [key]: e.target.value },
                            })
                          }}
                          className="h-7 text-xs"
                          placeholder={`Value for ${key}`}
                        />
                      </div>
                    ))}
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => handleSaveCharOverride(char.id)}
                    >
                      Save
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
