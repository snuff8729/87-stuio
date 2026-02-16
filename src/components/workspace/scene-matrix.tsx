import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Delete02Icon,
  Image02Icon,
  Tick01Icon,
  Cancel01Icon,
  GridIcon,
  TextIcon,
  ArrowDown01Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { extractPlaceholders, resolvePlaceholders } from '@/lib/placeholder'
import {
  bulkUpdatePlaceholders,
  upsertCharacterOverride,
} from '@/server/functions/project-scenes'

function StatusDot({ filled, template }: { filled: boolean; template?: boolean }) {
  if (!filled) return <span className="inline-block size-1.5 rounded-full shrink-0 bg-muted-foreground/25 ring-1 ring-muted-foreground/20" />
  if (template) return <span className="inline-block size-1.5 rounded-full shrink-0 bg-amber-500" />
  return <span className="inline-block size-1.5 rounded-full shrink-0 bg-emerald-500" />
}

interface SceneData {
  id: number
  name: string
  placeholders: string | null
  sortOrder: number | null
  recentImageCount: number
  thumbnailPath: string | null
  thumbnailImageId: number | null
}

interface ScenePackData {
  id: number
  name: string
  scenes: SceneData[]
}

interface CharacterData {
  id: number
  name: string
  charPrompt: string
  charNegative: string
}

interface CharacterOverride {
  projectSceneId: number
  characterId: number
  placeholders: string
}

interface SceneMatrixProps {
  scenePacks: ScenePackData[]
  projectId: number
  generalPrompt: string
  negativePrompt: string
  characters: CharacterData[]
  characterOverrides: Record<number, CharacterOverride[]>
  onAddScene: (name: string) => Promise<void>
  onDeleteScene: (sceneId: number) => Promise<void>
  onRenameScene: (id: number, name: string) => Promise<void>
  onPlaceholdersChange: () => void
}

export function SceneMatrix({
  scenePacks,
  projectId,
  generalPrompt,
  negativePrompt,
  characters,
  characterOverrides,
  onAddScene,
  onDeleteScene,
  onRenameScene,
  onPlaceholdersChange,
}: SceneMatrixProps) {
  const [selectedScene, setSelectedScene] = useState<number | null>(null)
  const [addingScene, setAddingScene] = useState(false)
  const [newSceneName, setNewSceneName] = useState('')
  const [editingName, setEditingName] = useState<number | null>(null)
  const [editNameValue, setEditNameValue] = useState('')
  const newSceneInputRef = useRef<HTMLInputElement>(null)

  // Collapsed state for character sections
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set())
  const [previewOpen, setPreviewOpen] = useState(false)

  // Scene Data (extra keys not in prompt)
  const [addingSceneData, setAddingSceneData] = useState(false)
  const [newSceneDataKey, setNewSceneDataKey] = useState('')
  const [filledCollapsed, setFilledCollapsed] = useState(false)

  function toggleSection(charId: number) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(charId)) next.delete(charId)
      else next.add(charId)
      return next
    })
  }

  // Placeholder keys for each context (general + negative share the same scene placeholders)
  const generalPlaceholderKeys = useMemo(
    () => [...new Set([
      ...extractPlaceholders(generalPrompt),
      ...extractPlaceholders(negativePrompt),
    ])],
    [generalPrompt, negativePrompt],
  )

  const characterPlaceholderKeys = useMemo(
    () =>
      characters.map((char) => ({
        characterId: char.id,
        characterName: char.name,
        keys: [...new Set([
          ...extractPlaceholders(char.charPrompt),
          ...extractPlaceholders(char.charNegative),
        ])],
      })),
    [characters],
  )

  const allScenes = useMemo(
    () => scenePacks.flatMap((pack) => pack.scenes),
    [scenePacks],
  )

  // Auto-select first scene
  useEffect(() => {
    if (selectedScene == null && allScenes.length > 0) {
      setSelectedScene(allScenes[0].id)
    }
    if (selectedScene != null && !allScenes.some((s) => s.id === selectedScene)) {
      setSelectedScene(allScenes[0]?.id ?? null)
    }
  }, [allScenes, selectedScene])

  // ── Debounced save logic ──
  const [localValues, setLocalValues] = useState<Record<string, string>>({})
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  function cellKey(context: 'general' | number, sceneId: number, placeholder: string) {
    return context === 'general'
      ? `g:${sceneId}:${placeholder}`
      : `c:${context}:${sceneId}:${placeholder}`
  }

  function getCellValue(scene: SceneData, key: string, context: 'general' | number): string {
    const ck = cellKey(context, scene.id, key)
    if (ck in localValues) return localValues[ck]

    if (context === 'general') {
      const placeholders = JSON.parse(scene.placeholders || '{}')
      return placeholders[key] ?? ''
    }

    const overrides = characterOverrides[scene.id] ?? []
    const override = overrides.find((o) => o.characterId === context)
    if (override) {
      const parsed = JSON.parse(override.placeholders || '{}')
      return parsed[key] ?? ''
    }
    return ''
  }

  function getGeneralValue(scene: SceneData, key: string): string {
    const ck = cellKey('general', scene.id, key)
    if (ck in localValues) return localValues[ck]
    const placeholders = JSON.parse(scene.placeholders || '{}')
    return placeholders[key] ?? ''
  }

  function getEffectiveCharValue(scene: SceneData, key: string, charId: number): string {
    const own = getCellValue(scene, key, charId)
    return own || getGeneralValue(scene, key)
  }

  function handleCellChange(context: 'general' | number, sceneId: number, key: string, value: string) {
    setLocalValues((prev) => ({ ...prev, [cellKey(context, sceneId, key)]: value }))
    scheduleSave()
  }

  function scheduleSave() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => flushSave(), 800)
  }

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    setLocalValues((currentLocal) => {
      if (Object.keys(currentLocal).length === 0) return currentLocal

      const generalChanges = new Map<number, Record<string, string>>()
      const charChanges = new Map<number, Map<number, Record<string, string>>>()

      for (const [k, v] of Object.entries(currentLocal)) {
        const parts = k.split(':')
        if (parts[0] === 'g') {
          const sceneId = Number(parts[1])
          const placeholder = parts[2]
          if (!generalChanges.has(sceneId)) generalChanges.set(sceneId, {})
          generalChanges.get(sceneId)![placeholder] = v
        } else {
          const charId = Number(parts[1])
          const sceneId = Number(parts[2])
          const placeholder = parts[3]
          if (!charChanges.has(charId)) charChanges.set(charId, new Map())
          const charMap = charChanges.get(charId)!
          if (!charMap.has(sceneId)) charMap.set(sceneId, {})
          charMap.get(sceneId)![placeholder] = v
        }
      }

      if (generalChanges.size > 0) {
        const updates: Array<{ sceneId: number; placeholders: string }> = []
        for (const [sceneId, changes] of generalChanges) {
          const scene = allScenes.find((s) => s.id === sceneId)
          const existing = JSON.parse(scene?.placeholders || '{}')
          updates.push({ sceneId, placeholders: JSON.stringify({ ...existing, ...changes }) })
        }
        bulkUpdatePlaceholders({ data: { updates } })
          .then(() => onPlaceholdersChange())
          .catch(() => toast.error('Failed to save'))
      }

      for (const [charId, sceneMap] of charChanges) {
        for (const [sceneId, changes] of sceneMap) {
          const overrides = characterOverrides[sceneId] ?? []
          const existing = overrides.find((o) => o.characterId === charId)
          const existingParsed = existing ? JSON.parse(existing.placeholders || '{}') : {}
          upsertCharacterOverride({
            data: {
              projectSceneId: sceneId,
              characterId: charId,
              placeholders: JSON.stringify({ ...existingParsed, ...changes }),
            },
          })
            .then(() => onPlaceholdersChange())
            .catch(() => toast.error('Failed to save override'))
        }
      }

      return {}
    })
  }, [allScenes, characterOverrides, onPlaceholdersChange])

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  // ── Actions ──
  async function handleAddScene() {
    const name = newSceneName.trim()
    if (!name) return
    try {
      await onAddScene(name)
      setNewSceneName('')
      setAddingScene(false)
    } catch {
      toast.error('Failed to add scene')
    }
  }

  async function handleRename(id: number) {
    const name = editNameValue.trim()
    if (!name) return
    try {
      await onRenameScene(id, name)
      setEditingName(null)
    } catch {
      toast.error('Failed to rename scene')
    }
  }

  // ── Scene Data key management ──
  async function handleAddSceneDataKey() {
    const key = newSceneDataKey.trim()
    if (!key || !selectedSceneData) return
    const existingPh = JSON.parse(selectedSceneData.placeholders || '{}')
    if (generalPlaceholderKeys.includes(key) || key in existingPh) {
      toast.error('Key already exists')
      return
    }
    try {
      await bulkUpdatePlaceholders({
        data: { updates: [{ sceneId: selectedSceneData.id, placeholders: JSON.stringify({ ...existingPh, [key]: '' }) }] },
      })
      onPlaceholdersChange()
      setNewSceneDataKey('')
      setAddingSceneData(false)
    } catch {
      toast.error('Failed to add key')
    }
  }

  async function handleRemoveGeneralKey(key: string) {
    if (!selectedSceneData) return
    const existingPh = JSON.parse(selectedSceneData.placeholders || '{}')
    const { [key]: _, ...remaining } = existingPh
    setLocalValues((prev) => {
      const next = { ...prev }
      delete next[cellKey('general', selectedSceneData.id, key)]
      return next
    })
    try {
      await bulkUpdatePlaceholders({
        data: { updates: [{ sceneId: selectedSceneData.id, placeholders: JSON.stringify(remaining) }] },
      })
      onPlaceholdersChange()
    } catch {
      toast.error('Failed to remove key')
    }
  }

  const selectedSceneData = allScenes.find((s) => s.id === selectedScene)

  // Stored placeholder keys from scene data (template-defined + user-edited)
  const storedSceneKeys = useMemo(() => {
    if (!selectedSceneData) return { general: [] as string[], character: [] as Array<{ characterId: number; characterName: string; keys: string[] }> }

    const scenePh = JSON.parse(selectedSceneData.placeholders || '{}') as Record<string, string>
    const generalStored = Object.keys(scenePh)

    const charStored = characters.map((char) => {
      const overrides = characterOverrides[selectedSceneData.id] ?? []
      const override = overrides.find((o) => o.characterId === char.id)
      const parsed = override ? JSON.parse(override.placeholders || '{}') as Record<string, string> : {}
      return { characterId: char.id, characterName: char.name, keys: Object.keys(parsed) }
    })

    return { general: generalStored, character: charStored }
  }, [selectedSceneData, characters, characterOverrides])

  // Extra keys from scene data that aren't in the current prompt template
  const extraGeneralKeys = useMemo(
    () => storedSceneKeys.general.filter((k) => !generalPlaceholderKeys.includes(k)),
    [storedSceneKeys.general, generalPlaceholderKeys],
  )

  const extraCharacterKeys = useMemo(
    () => storedSceneKeys.character.map(({ characterId, characterName, keys }) => {
      const promptKeys = characterPlaceholderKeys.find((c) => c.characterId === characterId)?.keys ?? []
      return { characterId, characterName, keys: keys.filter((k) => !promptKeys.includes(k)) }
    }).filter((c) => c.keys.length > 0),
    [storedSceneKeys.character, characterPlaceholderKeys],
  )

  const hasPromptKeys = generalPlaceholderKeys.length > 0 ||
    characterPlaceholderKeys.some((c) => c.keys.length > 0)

  // ── Prompt preview (resolved) ──
  const resolvedPrompts = useMemo(() => {
    if (!selectedSceneData) return null

    // Build general placeholder values map
    const generalValues: Record<string, string> = {}
    for (const key of generalPlaceholderKeys) {
      generalValues[key] = getCellValue(selectedSceneData, key, 'general')
    }
    // Include extra keys from stored data
    for (const key of extraGeneralKeys) {
      generalValues[key] = getCellValue(selectedSceneData, key, 'general')
    }

    const resolvedGeneral = resolvePlaceholders(generalPrompt, generalValues)
    const resolvedNegative = resolvePlaceholders(negativePrompt, generalValues)

    const resolvedCharacters = characters.map((char) => {
      // Start with general values as base (fallback)
      const charValues: Record<string, string> = { ...generalValues }
      const charKeys = characterPlaceholderKeys.find((c) => c.characterId === char.id)?.keys ?? []
      for (const key of charKeys) {
        const own = getCellValue(selectedSceneData, key, char.id)
        if (own) charValues[key] = own
      }
      // Include extra character keys
      const extraKeys = extraCharacterKeys.find((c) => c.characterId === char.id)?.keys ?? []
      for (const key of extraKeys) {
        const own = getCellValue(selectedSceneData, key, char.id)
        if (own) charValues[key] = own
      }
      return {
        name: char.name,
        prompt: resolvePlaceholders(char.charPrompt, charValues),
        negative: resolvePlaceholders(char.charNegative, charValues),
      }
    })

    return { general: resolvedGeneral, negative: resolvedNegative, characters: resolvedCharacters }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSceneData, generalPrompt, negativePrompt, characters, characterPlaceholderKeys, extraGeneralKeys, extraCharacterKeys, generalPlaceholderKeys, localValues, characterOverrides])

  function scrollToSlot(type: 'g' | 'c', key: string, charId?: number) {
    const id = type === 'g' ? `slot-g-${key}` : `slot-c-${charId}-${key}`
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const textarea = el.querySelector('textarea')
      textarea?.focus()
    }
  }

  // Classified keys for Unfilled/Filled sections
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const classifiedKeys = useMemo(() => {
    if (!selectedSceneData) return null

    const unfilledGeneral = generalPlaceholderKeys.filter((key) => !getCellValue(selectedSceneData, key, 'general'))
    const filledGeneral = generalPlaceholderKeys.filter((key) => !!getCellValue(selectedSceneData, key, 'general'))

    const unfilledChars: Array<{ char: CharacterData; keys: string[] }> = []
    const filledChars: Array<{ char: CharacterData; keys: Array<{ key: string; isTemplate: boolean; generalValue: string }> }> = []

    for (const char of characters) {
      const keys = characterPlaceholderKeys.find((c) => c.characterId === char.id)?.keys ?? []
      const unfilled: string[] = []
      const filled: Array<{ key: string; isTemplate: boolean; generalValue: string }> = []

      for (const key of keys) {
        const ownValue = getCellValue(selectedSceneData, key, char.id)
        const generalValue = getGeneralValue(selectedSceneData, key)

        if (!ownValue && !generalValue) {
          unfilled.push(key)
        } else {
          filled.push({ key, isTemplate: !ownValue && !!generalValue, generalValue })
        }
      }

      if (unfilled.length > 0) unfilledChars.push({ char, keys: unfilled })
      if (filled.length > 0) filledChars.push({ char, keys: filled })
    }

    const totalUnfilled = unfilledGeneral.length + unfilledChars.reduce((s, e) => s + e.keys.length, 0)
    const totalFilled = filledGeneral.length + filledChars.reduce((s, e) => s + e.keys.length, 0)

    return { unfilledGeneral, filledGeneral, unfilledChars, filledChars, totalUnfilled, totalFilled }
  }, [selectedSceneData, generalPlaceholderKeys, characters, characterPlaceholderKeys, localValues, characterOverrides])

  const filledCounts = classifiedKeys
    ? { filled: classifiedKeys.totalFilled, total: classifiedKeys.totalFilled + classifiedKeys.totalUnfilled }
    : { filled: 0, total: 0 }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex min-h-0">
        {/* ── Left: scene list ── */}
        <div className="w-52 shrink-0 bg-secondary/10 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Scenes
            </span>
            <button
              onClick={() => {
                setAddingScene(true)
                setTimeout(() => newSceneInputRef.current?.focus(), 50)
              }}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
              title="Add Scene"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            {addingScene && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1.5">
                <Input
                  ref={newSceneInputRef}
                  value={newSceneName}
                  onChange={(e) => setNewSceneName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddScene()
                    if (e.key === 'Escape') { setAddingScene(false); setNewSceneName('') }
                  }}
                  placeholder="Scene name"
                  className="h-7 text-sm"
                  autoFocus
                />
                <div className="flex gap-1">
                  <Button size="xs" onClick={handleAddScene} disabled={!newSceneName.trim()} className="flex-1">
                    Add
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => { setAddingScene(false); setNewSceneName('') }} className="flex-1">
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {allScenes.map((scene) => {
              const isSelected = selectedScene === scene.id

              return (
                <div
                  key={scene.id}
                  onClick={() => setSelectedScene(scene.id)}
                  className={`rounded-lg cursor-pointer transition-all group/item ${
                    isSelected
                      ? 'bg-secondary ring-1 ring-primary/30'
                      : 'hover:bg-secondary/60'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="relative">
                    {scene.thumbnailPath ? (
                      <div className="aspect-[3/4] rounded-t-lg overflow-hidden">
                        <img
                          src={`/api/thumbnails/${scene.thumbnailPath.replace('data/thumbnails/', '')}`}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="aspect-[3/4] rounded-t-lg bg-secondary/60 flex items-center justify-center">
                        <HugeiconsIcon icon={Image02Icon} className="size-5 text-muted-foreground/15" />
                      </div>
                    )}
                    {scene.recentImageCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-xs text-white/80 tabular-nums">
                        <HugeiconsIcon icon={Image02Icon} className="size-2.5" />
                        {scene.recentImageCount}
                      </span>
                    )}
                  </div>

                  <div className="px-2.5 pt-1.5 pb-2">
                    <div className="flex items-center gap-1">
                      <div className={`text-sm font-medium truncate flex-1 ${isSelected ? 'text-primary' : 'text-foreground/90'}`}>
                        {scene.name}
                      </div>
                      <ConfirmDialog
                        trigger={
                          <button
                            className="opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-destructive transition-all p-0.5 rounded shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                          </button>
                        }
                        title="Delete Scene"
                        description={`Delete "${scene.name}" and all associated images data?`}
                        onConfirm={() => {
                          if (selectedScene === scene.id) setSelectedScene(null)
                          onDeleteScene(scene.id)
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right: direct edit + preview ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selectedSceneData ? (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
                <div className="size-8 rounded-md overflow-hidden shrink-0 bg-secondary/60">
                  {selectedSceneData.thumbnailPath ? (
                    <img
                      src={`/api/thumbnails/${selectedSceneData.thumbnailPath.replace('data/thumbnails/', '')}`}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <HugeiconsIcon icon={Image02Icon} className="size-5 text-muted-foreground/20" />
                    </div>
                  )}
                </div>

                {editingName === selectedSceneData.id ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Input
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(selectedSceneData.id)
                        if (e.key === 'Escape') setEditingName(null)
                      }}
                      className="h-7 text-base flex-1"
                      autoFocus
                    />
                    <button onClick={() => handleRename(selectedSceneData.id)} className="text-primary hover:text-primary/80 transition-colors shrink-0 p-1">
                      <HugeiconsIcon icon={Tick01Icon} className="size-5" />
                    </button>
                    <button onClick={() => setEditingName(null)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-1">
                      <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => {
                        setEditingName(selectedSceneData.id)
                        setEditNameValue(selectedSceneData.name)
                      }}
                      className="text-base font-semibold hover:text-primary transition-colors truncate block"
                      title="Click to rename"
                    >
                      {selectedSceneData.name}
                    </button>
                    {selectedSceneData.recentImageCount > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {selectedSceneData.recentImageCount} images
                      </span>
                    )}
                  </div>
                )}

                <Link
                  to="/workspace/$projectId/scenes/$sceneId"
                  params={{
                    projectId: String(projectId),
                    sceneId: String(selectedSceneData.id),
                  }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors shrink-0 px-2 py-1 rounded-md hover:bg-secondary/80"
                >
                  Gallery &rarr;
                </Link>
              </div>

              {/* Content: Keys + Unfilled/Filled + Scene Data + Preview */}
              <div className="flex-1 overflow-y-auto">
                {hasPromptKeys && classifiedKeys ? (
                  <>
                    {/* ── Keys Section ── */}
                    <div className="px-5 pt-4 pb-2">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Keys</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {filledCounts.total - filledCounts.filled > 0
                            ? <><span className="text-amber-500">{filledCounts.total - filledCounts.filled}</span>/{filledCounts.total} unfilled</>
                            : <>{filledCounts.total}/{filledCounts.total} filled</>
                          }
                        </span>
                      </div>

                      {/* General keys */}
                      {generalPlaceholderKeys.length > 0 && (
                        <div className="mb-2.5">
                          {characters.length > 0 && (
                            <div className="text-[11px] text-muted-foreground/60 mb-1">General</div>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {generalPlaceholderKeys.map((key) => (
                              <Badge
                                key={key}
                                variant="secondary"
                                className="cursor-pointer text-xs gap-1 h-5 px-1.5"
                                onClick={() => scrollToSlot('g', key)}
                              >
                                <StatusDot filled={!!getCellValue(selectedSceneData, key, 'general')} />
                                {key}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Character keys — 3-state dots */}
                      {characters.map((char) => {
                        const keys = characterPlaceholderKeys.find((c) => c.characterId === char.id)?.keys ?? []
                        if (keys.length === 0) return null
                        return (
                          <div key={char.id} className="mb-2.5">
                            <div className="text-[11px] text-muted-foreground/60 mb-1">{char.name}</div>
                            <div className="flex flex-wrap gap-1">
                              {keys.map((key) => {
                                const ownValue = getCellValue(selectedSceneData, key, char.id)
                                const generalValue = getGeneralValue(selectedSceneData, key)
                                const isFilled = !!ownValue
                                const isTemplate = !ownValue && !!generalValue
                                return (
                                  <Badge
                                    key={key}
                                    variant="secondary"
                                    className="cursor-pointer text-xs gap-1 h-5 px-1.5"
                                    onClick={() => scrollToSlot('c', key, char.id)}
                                  >
                                    <StatusDot filled={isFilled || isTemplate} template={isTemplate} />
                                    {key}
                                  </Badge>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* ── Divider ── */}
                    <div className="border-t border-border/50 mx-5 my-1" />

                    {/* ── Unfilled Section ── */}
                    <div className="px-5 pb-4 pt-3 space-y-4">
                      {classifiedKeys.totalUnfilled > 0 && (
                        <div className="space-y-2.5">
                          <span className="text-xs font-medium text-amber-500/80 uppercase tracking-wider">
                            Unfilled ({classifiedKeys.totalUnfilled})
                          </span>

                          {/* General unfilled */}
                          {classifiedKeys.unfilledGeneral.length > 0 && (
                            <div className="space-y-2.5">
                              {characters.length > 0 && (
                                <div className="text-xs text-muted-foreground/60">General</div>
                              )}
                              {classifiedKeys.unfilledGeneral.map((key) => (
                                <div key={key} id={`slot-g-${key}`}>
                                  <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                                    <StatusDot filled={false} />
                                    <span className="inline-block rounded bg-secondary/80 px-1.5 py-0.5">
                                      {`{{${key}}}`}
                                    </span>
                                  </label>
                                  <textarea
                                    value={getCellValue(selectedSceneData, key, 'general')}
                                    onChange={(e) => handleCellChange('general', selectedSceneData.id, key, e.target.value)}
                                    rows={4}
                                    className="w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-base font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none resize-y min-h-[5rem] transition-all"
                                    placeholder={`Value for ${key}...`}
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Character unfilled */}
                          {classifiedKeys.unfilledChars.map(({ char, keys }) => (
                            <div key={char.id} className="space-y-2.5">
                              <div className="text-xs text-muted-foreground/60">{char.name}</div>
                              {keys.map((key) => (
                                <div key={key} id={`slot-c-${char.id}-${key}`}>
                                  <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                                    <StatusDot filled={false} />
                                    <span className="inline-block rounded bg-secondary/80 px-1.5 py-0.5">
                                      {`{{${key}}}`}
                                    </span>
                                  </label>
                                  <textarea
                                    value={getCellValue(selectedSceneData, key, char.id)}
                                    onChange={(e) => handleCellChange(char.id, selectedSceneData.id, key, e.target.value)}
                                    rows={4}
                                    className="w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-base font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none resize-y min-h-[5rem] transition-all"
                                    placeholder={`${char.name}: ${key}...`}
                                  />
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Filled Section ── */}
                      {classifiedKeys.totalFilled > 0 && (
                        <div>
                          <button
                            onClick={() => setFilledCollapsed(!filledCollapsed)}
                            className="w-full flex items-center justify-between text-left py-1"
                          >
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Filled ({classifiedKeys.totalFilled})
                            </span>
                            <HugeiconsIcon
                              icon={ArrowDown01Icon}
                              className={`size-4 text-muted-foreground transition-transform duration-200 ${filledCollapsed ? '-rotate-90' : ''}`}
                            />
                          </button>

                          {!filledCollapsed && (
                            <div className="mt-2.5 space-y-2.5">
                              {/* General filled */}
                              {classifiedKeys.filledGeneral.length > 0 && (
                                <div className="space-y-2.5">
                                  {characters.length > 0 && (
                                    <div className="text-xs text-muted-foreground/60">General</div>
                                  )}
                                  {classifiedKeys.filledGeneral.map((key) => (
                                    <div key={key} id={`slot-g-${key}`}>
                                      <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                                        <StatusDot filled={true} />
                                        <span className="inline-block rounded bg-secondary/80 px-1.5 py-0.5">
                                          {`{{${key}}}`}
                                        </span>
                                      </label>
                                      <textarea
                                        value={getCellValue(selectedSceneData, key, 'general')}
                                        onChange={(e) => handleCellChange('general', selectedSceneData.id, key, e.target.value)}
                                        rows={4}
                                        className="w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-base font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none resize-y min-h-[5rem] transition-all"
                                        placeholder={`Value for ${key}...`}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Character filled */}
                              {classifiedKeys.filledChars.map(({ char, keys }) => {
                                const isCollapsed = collapsedSections.has(char.id)
                                return (
                                  <div key={char.id} className="rounded-lg bg-secondary/15 border-l-2 border-primary/30">
                                    <button
                                      onClick={() => toggleSection(char.id)}
                                      className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-secondary/25 transition-colors rounded-t-lg"
                                    >
                                      <span className="text-base font-medium">{char.name}</span>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-muted-foreground tabular-nums">{keys.length}</span>
                                        <HugeiconsIcon
                                          icon={ArrowDown01Icon}
                                          className={`size-5 text-muted-foreground transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                                        />
                                      </div>
                                    </button>

                                    {!isCollapsed && (
                                      <div className="px-4 pb-3 space-y-2.5">
                                        {keys.map(({ key, isTemplate, generalValue }) => (
                                          <div key={key} id={`slot-c-${char.id}-${key}`}>
                                            <label className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mb-1.5">
                                              <StatusDot filled={true} template={isTemplate} />
                                              <span className="inline-block rounded bg-secondary/80 px-1.5 py-0.5">
                                                {`{{${key}}}`}
                                              </span>
                                              {isTemplate && (
                                                <span className="text-[10px] text-amber-500/80 bg-amber-500/10 rounded px-1 py-0.5">General</span>
                                              )}
                                            </label>
                                            <textarea
                                              value={getCellValue(selectedSceneData, key, char.id)}
                                              onChange={(e) => handleCellChange(char.id, selectedSceneData.id, key, e.target.value)}
                                              rows={4}
                                              className="w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-base font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none resize-y min-h-[5rem] transition-all"
                                              placeholder={generalValue ? `\u2190 General: ${generalValue}` : `${char.name}: ${key}...`}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Scene Data Section ── */}
                    <div className="border-t border-border/50 mx-5 my-1" />
                    <div className="px-5 pb-4 pt-3 space-y-2.5">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scene Data</span>

                      {extraGeneralKeys.map((key) => (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground/70 shrink-0 min-w-0 truncate max-w-[8rem]" title={key}>{key}</span>
                          <input
                            type="text"
                            value={getCellValue(selectedSceneData, key, 'general')}
                            onChange={(e) => handleCellChange('general', selectedSceneData.id, key, e.target.value)}
                            className="flex-1 h-8 rounded-lg border border-dashed border-border bg-input/20 px-2.5 text-sm font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all min-w-0"
                            placeholder={`Value for ${key}`}
                          />
                          <button
                            onClick={() => handleRemoveGeneralKey(key)}
                            className="text-muted-foreground/50 hover:text-destructive transition-colors p-1 rounded shrink-0"
                            title={`Remove ${key}`}
                          >
                            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                          </button>
                        </div>
                      ))}

                      {addingSceneData ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={newSceneDataKey}
                            onChange={(e) => setNewSceneDataKey(e.target.value)}
                            placeholder="Key name"
                            className="h-8 text-sm w-32 font-mono"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddSceneDataKey()
                              if (e.key === 'Escape') { setAddingSceneData(false); setNewSceneDataKey('') }
                            }}
                          />
                          <Button size="xs" onClick={handleAddSceneDataKey} disabled={!newSceneDataKey.trim()}>Add</Button>
                          <Button size="xs" variant="ghost" onClick={() => { setAddingSceneData(false); setNewSceneDataKey('') }}>Cancel</Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingSceneData(true)}
                          className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1 px-2 rounded-lg border border-dashed border-border/50 hover:border-border"
                        >
                          <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                          Add Data
                        </button>
                      )}
                    </div>
                  </>
                ) : extraGeneralKeys.length > 0 ? (
                  /* No prompt keys but has scene data */
                  <div className="px-5 py-4 space-y-2.5">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scene Data</span>

                    {extraGeneralKeys.map((key) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground/70 shrink-0 min-w-0 truncate max-w-[8rem]" title={key}>{key}</span>
                        <input
                          type="text"
                          value={getCellValue(selectedSceneData, key, 'general')}
                          onChange={(e) => handleCellChange('general', selectedSceneData.id, key, e.target.value)}
                          className="flex-1 h-8 rounded-lg border border-dashed border-border bg-input/20 px-2.5 text-sm font-mono placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all min-w-0"
                          placeholder={`Value for ${key}`}
                        />
                        <button
                          onClick={() => handleRemoveGeneralKey(key)}
                          className="text-muted-foreground/50 hover:text-destructive transition-colors p-1 rounded shrink-0"
                          title={`Remove ${key}`}
                        >
                          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                        </button>
                      </div>
                    ))}

                    <p className="text-xs text-muted-foreground/50 mt-2">
                      Add {'{{placeholders}}'} to your prompts to create key slots.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
                    <div className="rounded-xl bg-secondary/30 p-4 mb-3">
                      <HugeiconsIcon icon={TextIcon} className="size-6 text-muted-foreground/25" />
                    </div>
                    <p className="text-sm text-muted-foreground max-w-48">
                      Add {'{{placeholders}}'} to your prompts to create key slots.
                    </p>
                  </div>
                )}

                {/* ── Prompt Preview ── */}
                {resolvedPrompts && (
                  <div className="border-t border-border/50 pt-4 px-5 pb-5">
                    <button
                      onClick={() => setPreviewOpen(!previewOpen)}
                      className="w-full flex items-center justify-between text-left group/preview"
                    >
                      <div className="flex items-center gap-1.5">
                        <HugeiconsIcon icon={ViewIcon} className="size-5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Prompt Preview
                        </span>
                      </div>
                      <HugeiconsIcon
                        icon={ArrowDown01Icon}
                        className={`size-5 text-muted-foreground transition-transform duration-200 ${
                          previewOpen ? '' : '-rotate-90'
                        }`}
                      />
                    </button>

                    {previewOpen && (
                      <div className="mt-3 space-y-3">
                        {/* General prompt */}
                        <div>
                          <div className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                            General Prompt
                          </div>
                          <div className="rounded-lg bg-secondary/20 border border-border/50 px-3 py-2 text-sm font-mono text-foreground/80 whitespace-pre-wrap break-all select-all">
                            {resolvedPrompts.general || <span className="text-muted-foreground/40 italic">empty</span>}
                          </div>
                        </div>

                        {/* Negative prompt */}
                        {resolvedPrompts.negative && (
                          <div>
                            <div className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                              Negative Prompt
                            </div>
                            <div className="rounded-lg bg-secondary/20 border border-border/50 px-3 py-2 text-sm font-mono text-foreground/80 whitespace-pre-wrap break-all select-all">
                              {resolvedPrompts.negative}
                            </div>
                          </div>
                        )}

                        {/* Character prompts */}
                        {resolvedPrompts.characters.map((char) => (
                          (char.prompt || char.negative) && (
                            <div key={char.name}>
                              <div className="text-xs font-medium text-primary/60 uppercase tracking-wider mb-1.5">
                                {char.name}
                              </div>
                              {char.prompt && (
                                <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2 text-sm font-mono text-foreground/80 whitespace-pre-wrap break-all select-all">
                                  {char.prompt}
                                </div>
                              )}
                              {char.negative && (
                                <div className="rounded-lg bg-secondary/20 border border-border/50 px-3 py-2 text-sm font-mono text-foreground/60 whitespace-pre-wrap break-all select-all mt-1.5">
                                  <span className="text-xs text-muted-foreground/50">neg: </span>
                                  {char.negative}
                                </div>
                              )}
                            </div>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Unselected state ── */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="space-y-4 max-w-xs">
                <div className="rounded-2xl bg-secondary/20 p-5 inline-block">
                  <HugeiconsIcon icon={GridIcon} className="size-8 text-muted-foreground/25" />
                </div>
                <p className="text-sm text-muted-foreground/60">
                  Select a scene from the left to edit its placeholders.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
