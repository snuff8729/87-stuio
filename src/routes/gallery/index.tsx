import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  listImages,
  updateImage,
  getImageDetail,
  addTag,
  removeTag,
  listTags,
  listProjectsForFilter,
} from '@/server/functions/gallery'

export const Route = createFileRoute('/gallery/')({
  loader: async () => {
    const [images, allTags, allProjects] = await Promise.all([
      listImages({ data: { page: 1, limit: 40 } }),
      listTags(),
      listProjectsForFilter(),
    ])
    return { initialImages: images, allTags, allProjects }
  },
  component: GalleryPage,
})

function GalleryPage() {
  const { initialImages, allTags, allProjects } = Route.useLoaderData()
  const [images, setImages] = useState(initialImages)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialImages.length >= 40)
  const [lightboxId, setLightboxId] = useState<number | null>(null)

  // Filters
  const [projectFilter, setProjectFilter] = useState<number | undefined>()
  const [favoriteFilter, setFavoriteFilter] = useState(false)
  const [minRating, setMinRating] = useState<number | undefined>()

  const observerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setImages(initialImages)
    setPage(1)
    setHasMore(initialImages.length >= 40)
  }, [initialImages])

  async function applyFilters() {
    setLoading(true)
    const result = await listImages({
      data: {
        page: 1,
        limit: 40,
        projectId: projectFilter,
        isFavorite: favoriteFilter || undefined,
        minRating,
      },
    })
    setImages(result)
    setPage(1)
    setHasMore(result.length >= 40)
    setLoading(false)
  }

  async function loadMore() {
    if (loading || !hasMore) return
    setLoading(true)
    const nextPage = page + 1
    const result = await listImages({
      data: {
        page: nextPage,
        limit: 40,
        projectId: projectFilter,
        isFavorite: favoriteFilter || undefined,
        minRating,
      },
    })
    setImages((prev) => [...prev, ...result])
    setPage(nextPage)
    setHasMore(result.length >= 40)
    setLoading(false)
  }

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = observerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  })

  async function handleToggleFavorite(imageId: number, current: number | null) {
    const newVal = current ? 0 : 1
    await updateImage({ data: { id: imageId, isFavorite: newVal } })
    setImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, isFavorite: newVal } : img)),
    )
  }

  // Navigate lightbox
  const currentIndex = lightboxId ? images.findIndex((img) => img.id === lightboxId) : -1

  function handleLightboxPrev() {
    if (currentIndex > 0) setLightboxId(images[currentIndex - 1].id)
  }

  function handleLightboxNext() {
    if (currentIndex < images.length - 1) setLightboxId(images[currentIndex + 1].id)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (lightboxId === null) return
      if (e.key === 'Escape') setLightboxId(null)
      if (e.key === 'ArrowLeft') handleLightboxPrev()
      if (e.key === 'ArrowRight') handleLightboxNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  return (
    <div>
      <PageHeader title="Gallery" description={`${images.length} images`} />

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={projectFilter ?? ''}
          onChange={(e) => setProjectFilter(e.target.value ? Number(e.target.value) : undefined)}
          className="h-8 px-2 rounded-md border border-border bg-background text-sm"
        >
          <option value="">All Projects</option>
          {allProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <Button
          size="sm"
          variant={favoriteFilter ? 'default' : 'outline'}
          onClick={() => setFavoriteFilter(!favoriteFilter)}
        >
          Favorites
        </Button>

        <select
          value={minRating ?? ''}
          onChange={(e) => setMinRating(e.target.value ? Number(e.target.value) : undefined)}
          className="h-8 px-2 rounded-md border border-border bg-background text-sm"
        >
          <option value="">Any Rating</option>
          {[1, 2, 3, 4, 5].map((r) => (
            <option key={r} value={r}>
              {r}+ stars
            </option>
          ))}
        </select>

        <Button size="sm" variant="outline" onClick={applyFilters}>
          Apply
        </Button>
      </div>

      {/* Image Grid */}
      {images.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">No images found</p>
          <p className="text-sm">Generate images from a project or adjust your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {images.map((img) => (
            <div
              key={img.id}
              className="relative group aspect-square rounded-lg overflow-hidden bg-secondary cursor-pointer"
              onClick={() => setLightboxId(img.id)}
            >
              {img.thumbnailPath ? (
                <img
                  src={`/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                  No thumbnail
                </div>
              )}
              {/* Favorite overlay */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleToggleFavorite(img.id, img.isFavorite)
                }}
                className="absolute top-1 right-1 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <span className={img.isFavorite ? 'text-red-500' : 'text-white/70'}>
                  {img.isFavorite ? '\u2764' : '\u2661'}
                </span>
              </button>
              {img.rating && (
                <div className="absolute bottom-1 left-1 text-xs text-yellow-400">
                  {'\u2605'.repeat(img.rating)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={observerRef} className="h-10" />
      {loading && (
        <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
      )}

      {/* Lightbox */}
      {lightboxId !== null && (
        <Lightbox
          imageId={lightboxId}
          onClose={() => setLightboxId(null)}
          onPrev={currentIndex > 0 ? handleLightboxPrev : undefined}
          onNext={currentIndex < images.length - 1 ? handleLightboxNext : undefined}
          onUpdate={(id, updates) => {
            setImages((prev) =>
              prev.map((img) => (img.id === id ? { ...img, ...updates } : img)),
            )
          }}
        />
      )}
    </div>
  )
}

// ─── Lightbox ───────────────────────────────────────────────────────────────

function Lightbox({
  imageId,
  onClose,
  onPrev,
  onNext,
  onUpdate,
}: {
  imageId: number
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  onUpdate: (id: number, updates: Record<string, unknown>) => void
}) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getImageDetail>> | null>(null)
  const [memo, setMemo] = useState('')
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    getImageDetail({ data: imageId }).then((d) => {
      setDetail(d)
      setMemo(d.memo || '')
    })
  }, [imageId])

  async function handleRating(rating: number) {
    if (!detail) return
    const newRating = detail.rating === rating ? null : rating
    await updateImage({ data: { id: imageId, rating: newRating } })
    setDetail({ ...detail, rating: newRating })
    onUpdate(imageId, { rating: newRating })
  }

  async function handleFavorite() {
    if (!detail) return
    const newVal = detail.isFavorite ? 0 : 1
    await updateImage({ data: { id: imageId, isFavorite: newVal } })
    setDetail({ ...detail, isFavorite: newVal })
    onUpdate(imageId, { isFavorite: newVal })
  }

  async function handleSaveMemo() {
    await updateImage({ data: { id: imageId, memo } })
    if (detail) setDetail({ ...detail, memo })
  }

  async function handleAddTag() {
    if (!newTag.trim()) return
    const tag = await addTag({ data: { imageId, tagName: newTag.trim() } })
    if (detail) {
      setDetail({
        ...detail,
        tags: [...detail.tags, { tagId: tag.id, tagName: tag.name }],
      })
    }
    setNewTag('')
  }

  async function handleRemoveTag(tagId: number) {
    await removeTag({ data: { imageId, tagId } })
    if (detail) {
      setDetail({
        ...detail,
        tags: detail.tags.filter((t) => t.tagId !== tagId),
      })
    }
  }

  if (!detail) return null

  const imageSrc = detail.filePath
    ? `/api/images/${detail.filePath.replace('data/images/', '')}`
    : ''

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex"
      onClick={onClose}
    >
      {/* Main image */}
      <div className="flex-1 flex items-center justify-center relative" onClick={(e) => e.stopPropagation()}>
        {onPrev && (
          <button
            onClick={onPrev}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-3xl"
          >
            &lsaquo;
          </button>
        )}
        <img
          src={imageSrc}
          alt=""
          className="max-h-[90vh] max-w-[70vw] object-contain"
        />
        {onNext && (
          <button
            onClick={onNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-3xl"
          >
            &rsaquo;
          </button>
        )}
      </div>

      {/* Side panel */}
      <div
        className="w-80 bg-background border-l border-border p-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Image Details</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            &times;
          </button>
        </div>

        {/* Favorite */}
        <div className="mb-4">
          <Button
            size="sm"
            variant={detail.isFavorite ? 'default' : 'outline'}
            onClick={handleFavorite}
          >
            {detail.isFavorite ? '\u2764 Favorited' : '\u2661 Favorite'}
          </Button>
        </div>

        {/* Rating */}
        <div className="mb-4">
          <label className="text-xs text-muted-foreground mb-1 block">Rating</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                onClick={() => handleRating(r)}
                className={`text-lg ${
                  detail.rating && r <= detail.rating ? 'text-yellow-400' : 'text-muted-foreground'
                }`}
              >
                {'\u2605'}
              </button>
            ))}
          </div>
        </div>

        {/* Memo */}
        <div className="mb-4">
          <label className="text-xs text-muted-foreground mb-1 block">Memo</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={handleSaveMemo}
            className="w-full h-20 rounded-md border border-border bg-background p-2 text-sm resize-none"
            placeholder="Add a note..."
          />
        </div>

        {/* Tags */}
        <div className="mb-4">
          <label className="text-xs text-muted-foreground mb-1 block">Tags</label>
          <div className="flex flex-wrap gap-1 mb-2">
            {detail.tags.map((t) => (
              <Badge key={t.tagId} variant="secondary" className="gap-1">
                {t.tagName}
                <button onClick={() => handleRemoveTag(t.tagId)} className="ml-1 text-xs">
                  &times;
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-1">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
              placeholder="Add tag..."
              className="h-7 text-xs"
            />
            <Button size="xs" variant="outline" onClick={handleAddTag}>
              Add
            </Button>
          </div>
        </div>

        {/* Metadata */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Metadata</label>
          <div className="text-xs space-y-1 text-muted-foreground">
            <p>Seed: {detail.seed}</p>
            <p>Created: {new Date(detail.createdAt!).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
