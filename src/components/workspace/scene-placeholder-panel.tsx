import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  TextIcon,
  ArrowDown01Icon,
  ViewIcon,
  Add01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { extractPlaceholders, resolvePlaceholders } from '@/lib/placeholder'
import {
  updateProjectScene,
  upsertCharacterOverride,
} from '@/server/functions/project-scenes'

function StatusDot({ filled, template }: { filled: boolean; template?: boolean }) {
  if (!filled) return <span className="inline-block size-1.5 rounded-full shrink-0 bg-muted-foreground/25 ring-1 ring-muted-foreground/20" />
  if (template) return <span className="inline-block size-1.5 rounded-full shrink-0 bg-amber-500" />
  return <span className="inline-block size-1.5 rounded-full shrink-0 bg-emerald-500" />
}

interface CharacterData {
  id: number
  name: string
  charPrompt: string
  charNegative: string
}

interface CharacterOverrideData {
  characterId: number
  placeholders: string | null
}

interface ScenePlaceholderPanelProps {
  sceneId: number
  scenePlaceholders: Record<string, string>
  characterOverrides: CharacterOverrideData[]
  generalPrompt: string
  negativePrompt: string
  characters: CharacterData[]
  onPlaceholdersChange?: () => void
}

export function ScenePlaceholderPanel({
  sceneId,
  scenePlaceholders,
  characterOverrides,
  generalPrompt,
  negativePrompt,
  characters,
  onPlaceholdersChange,
}: ScenePlaceholderPanelProps) {
  // Collapsed state for character sections within Filled
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set())
  const [previewOpen, setPreviewOpen] = useState(false)
  const [filledCollapsed, setFilledCollapsed] = useState(false)

  // Scene Data (extra keys not in prompt)
  const [addingSceneData, setAddingSceneData] = useState(false)
  const [newSceneDataKey, setNewSceneDataKey] = useState('')

  function toggleSection(charId: number) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(charId)) next.delete(charId)
      else next.add(charId)
      return next
    })
  }

  // Placeholder keys from prompts
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

  // ── Local editing state with debounced save ──
  const [localValues, setLocalValues] = useState<Record<string, string>>({})
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Reset local values when scene changes
  useEffect(() => {
    setLocalValues({})
  }, [sceneId])

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  function cellKey(context: 'general' | number, placeholder: string) {
    return context === 'general'
      ? `g:${placeholder}`
      : `c:${context}:${placeholder}`
  }

  function getCellValue(key: string, context: 'general' | number): string {
    const ck = cellKey(context, key)
    if (ck in localValues) return localValues[ck]

    if (context === 'general') {
      return scenePlaceholders[key] ?? ''
    }

    const override = characterOverrides.find((o) => o.characterId === context)
    if (override) {
      const parsed = JSON.parse(override.placeholders || '{}')
      return parsed[key] ?? ''
    }
    return ''
  }

  function getGeneralValue(key: string): string {
    const ck = cellKey('general', key)
    if (ck in localValues) return localValues[ck]
    return scenePlaceholders[key] ?? ''
  }

  function getEffectiveCharValue(key: string, charId: number): string {
    const own = getCellValue(key, charId)
    return own || getGeneralValue(key)
  }

  function handleCellChange(context: 'general' | number, key: string, value: string) {
    setLocalValues((prev) => ({ ...prev, [cellKey(context, key)]: value }))
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

      const generalChanges: Record<string, string> = {}
      const charChanges = new Map<number, Record<string, string>>()

      for (const [k, v] of Object.entries(currentLocal)) {
        const parts = k.split(':')
        if (parts[0] === 'g') {
          generalChanges[parts[1]] = v
        } else {
          const charId = Number(parts[1])
          const placeholder = parts[2]
          if (!charChanges.has(charId)) charChanges.set(charId, {})
          charChanges.get(charId)![placeholder] = v
        }
      }

      if (Object.keys(generalChanges).length > 0) {
        const merged = { ...scenePlaceholders, ...generalChanges }
        updateProjectScene({ data: { id: sceneId, placeholders: JSON.stringify(merged) } })
          .then(() => onPlaceholdersChange?.())
          .catch(() => toast.error('Failed to save'))
      }

      for (const [charId, changes] of charChanges) {
        const existing = characterOverrides.find((o) => o.characterId === charId)
        const existingParsed = existing ? JSON.parse(existing.placeholders || '{}') : {}
        upsertCharacterOverride({
          data: {
            projectSceneId: sceneId,
            characterId: charId,
            placeholders: JSON.stringify({ ...existingParsed, ...changes }),
          },
        })
          .then(() => onPlaceholdersChange?.())
          .catch(() => toast.error('Failed to save override'))
      }

      return {}
    })
  }, [sceneId, scenePlaceholders, characterOverrides, onPlaceholdersChange])

  // ── Scene Data key management ──
  async function handleAddSceneDataKey() {
    const key = newSceneDataKey.trim()
    if (!key) return
    if (generalPlaceholderKeys.includes(key) || key in scenePlaceholders) {
      toast.error('Key already exists')
      return
    }
    try {
      await updateProjectScene({ data: { id: sceneId, placeholders: JSON.stringify({ ...scenePlaceholders, [key]: '' }) } })
      onPlaceholdersChange?.()
      setNewSceneDataKey('')
      setAddingSceneData(false)
    } catch {
      toast.error('Failed to add key')
    }
  }

  async function handleRemoveGeneralKey(key: string) {
    const { [key]: _, ...remaining } = scenePlaceholders
    setLocalValues((prev) => {
      const next = { ...prev }
      delete next[cellKey('general', key)]
      return next
    })
    try {
      await updateProjectScene({ data: { id: sceneId, placeholders: JSON.stringify(remaining) } })
      onPlaceholdersChange?.()
    } catch {
      toast.error('Failed to remove key')
    }
  }

  // Stored keys (from scene data, possibly including template-defined extras)
  const storedGeneralKeys = Object.keys(scenePlaceholders)
  const storedCharKeys = characters.map((char) => {
    const override = characterOverrides.find((o) => o.characterId === char.id)
    const parsed = override ? JSON.parse(override.placeholders || '{}') as Record<string, string> : {}
    return { characterId: char.id, characterName: char.name, keys: Object.keys(parsed) }
  })

  // Extra keys from scene data that aren't in current prompt
  const extraGeneralKeys = storedGeneralKeys.filter((k) => !generalPlaceholderKeys.includes(k))
  const extraCharacterKeys = storedCharKeys
    .map(({ characterId, characterName, keys }) => {
      const promptKeys = characterPlaceholderKeys.find((c) => c.characterId === characterId)?.keys ?? []
      return { characterId, characterName, keys: keys.filter((k) => !promptKeys.includes(k)) }
    })
    .filter((c) => c.keys.length > 0)

  const hasPromptKeys = generalPlaceholderKeys.length > 0 ||
    characterPlaceholderKeys.some((c) => c.keys.length > 0)

  // ── Prompt preview (resolved) ──
  const resolvedPrompts = useMemo(() => {
    const generalValues: Record<string, string> = {}
    for (const key of generalPlaceholderKeys) {
      generalValues[key] = getCellValue(key, 'general')
    }
    for (const key of extraGeneralKeys) {
      generalValues[key] = getCellValue(key, 'general')
    }

    const resolvedGeneral = resolvePlaceholders(generalPrompt, generalValues)
    const resolvedNegative = resolvePlaceholders(negativePrompt, generalValues)

    const resolvedCharacters = characters.map((char) => {
      // Start with general values as base (fallback)
      const charValues: Record<string, string> = { ...generalValues }
      const charKeys = characterPlaceholderKeys.find((c) => c.characterId === char.id)?.keys ?? []
      for (const key of charKeys) {
        const own = getCellValue(key, char.id)
        if (own) charValues[key] = own
      }
      const extraKeys = extraCharacterKeys.find((c) => c.characterId === char.id)?.keys ?? []
      for (const key of extraKeys) {
        const own = getCellValue(key, char.id)
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
  }, [generalPrompt, negativePrompt, characters, characterPlaceholderKeys, extraGeneralKeys, extraCharacterKeys, generalPlaceholderKeys, localValues, scenePlaceholders, characterOverrides])

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
    const unfilledGeneral = generalPlaceholderKeys.filter((key) => !getCellValue(key, 'general'))
    const filledGeneral = generalPlaceholderKeys.filter((key) => !!getCellValue(key, 'general'))

    const unfilledChars: Array<{ char: CharacterData; keys: string[] }> = []
    const filledChars: Array<{ char: CharacterData; keys: Array<{ key: string; isTemplate: boolean; generalValue: string }> }> = []

    for (const char of characters) {
      const keys = characterPlaceholderKeys.find((c) => c.characterId === char.id)?.keys ?? []
      const unfilled: string[] = []
      const filled: Array<{ key: string; isTemplate: boolean; generalValue: string }> = []

      for (const key of keys) {
        const ownValue = getCellValue(key, char.id)
        const generalValue = getGeneralValue(key)

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
  }, [generalPlaceholderKeys, characters, characterPlaceholderKeys, localValues, scenePlaceholders, characterOverrides])

  const filledCounts = { filled: classifiedKeys.totalFilled, total: classifiedKeys.totalFilled + classifiedKeys.totalUnfilled }

  return (
    <div className="p-4 space-y-4">
      {hasPromptKeys ? (
        <>
          {/* ── Keys Section ── */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Keys</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {filledCounts.total - filledCounts.filled > 0
                  ? <><span className="text-amber-500">{filledCounts.total - filledCounts.filled}</span>/{filledCounts.total} unfilled</>
                  : <>{filledCounts.total}/{filledCounts.total} filled</>
                }
              </span>
            </div>

            {/* General keys — prompt-derived only */}
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
                      <StatusDot filled={!!getCellValue(key, 'general')} />
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
                      const ownValue = getCellValue(key, char.id)
                      const generalValue = getGeneralValue(key)
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
          <div className="border-t border-border/50 my-1" />

          {/* ── Unfilled / Filled Sections ── */}
          <div className="space-y-4">
            {/* Unfilled Section */}
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
                          value={getCellValue(key, 'general')}
                          onChange={(e) => handleCellChange('general', key, e.target.value)}
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
                          value={getCellValue(key, char.id)}
                          onChange={(e) => handleCellChange(char.id, key, e.target.value)}
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

            {/* Filled Section */}
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
                              value={getCellValue(key, 'general')}
                              onChange={(e) => handleCellChange('general', key, e.target.value)}
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
                                    value={getCellValue(key, char.id)}
                                    onChange={(e) => handleCellChange(char.id, key, e.target.value)}
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
          <div className="border-t border-border/50 my-1" />
          <div className="space-y-2.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scene Data</span>

            {extraGeneralKeys.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground/70 shrink-0 min-w-0 truncate max-w-[8rem]" title={key}>{key}</span>
                <input
                  type="text"
                  value={getCellValue(key, 'general')}
                  onChange={(e) => handleCellChange('general', key, e.target.value)}
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
        <div className="space-y-2.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scene Data</span>

          {extraGeneralKeys.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground/70 shrink-0 min-w-0 truncate max-w-[8rem]" title={key}>{key}</span>
              <input
                type="text"
                value={getCellValue(key, 'general')}
                onChange={(e) => handleCellChange('general', key, e.target.value)}
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
        <div className="flex flex-col items-center justify-center py-12 text-center">
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
        <div className="border-t border-border/50 pt-4">
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
  )
}
