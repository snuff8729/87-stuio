import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { generatedImages, tags, imageTags, projects, projectScenes } from '../db/schema'
import { eq, desc, and, sql, inArray } from 'drizzle-orm'

export const listImages = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: {
      page?: number
      limit?: number
      projectId?: number
      projectSceneId?: number
      sourceSceneId?: number
      isFavorite?: boolean
      minRating?: number
      tagIds?: number[]
    }) => data,
  )
  .handler(async ({ data }) => {
    const page = data.page ?? 1
    const limit = data.limit ?? 40
    const offset = (page - 1) * limit

    const conditions = []
    if (data.projectId) conditions.push(eq(generatedImages.projectId, data.projectId))
    if (data.projectSceneId) conditions.push(eq(generatedImages.projectSceneId, data.projectSceneId))
    if (data.sourceSceneId) conditions.push(eq(generatedImages.sourceSceneId, data.sourceSceneId))
    if (data.isFavorite) conditions.push(eq(generatedImages.isFavorite, 1))
    if (data.minRating) conditions.push(sql`${generatedImages.rating} >= ${data.minRating}`)

    let query = db
      .select()
      .from(generatedImages)
      .orderBy(desc(generatedImages.createdAt))
      .limit(limit)
      .offset(offset)

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query
    }

    const images = query.all()

    // If tag filter, post-filter (simpler than join for SQLite)
    if (data.tagIds && data.tagIds.length > 0) {
      const taggedImageIds = db
        .select({ imageId: imageTags.imageId })
        .from(imageTags)
        .where(inArray(imageTags.tagId, data.tagIds))
        .all()
        .map((r) => r.imageId)
      const tagSet = new Set(taggedImageIds)
      return images.filter((img) => tagSet.has(img.id))
    }

    return images
  })

export const updateImage = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { id: number; isFavorite?: number; rating?: number | null; memo?: string | null }) =>
      data,
  )
  .handler(async ({ data }) => {
    const { id, ...updates } = data
    db.update(generatedImages)
      .set(updates)
      .where(eq(generatedImages.id, id))
      .run()
    return { success: true }
  })

export const getImageDetail = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const image = db
      .select()
      .from(generatedImages)
      .where(eq(generatedImages.id, id))
      .get()
    if (!image) throw new Error('Image not found')

    const imgTags = db
      .select({ tagId: imageTags.tagId, tagName: tags.name })
      .from(imageTags)
      .innerJoin(tags, eq(imageTags.tagId, tags.id))
      .where(eq(imageTags.imageId, id))
      .all()

    return { ...image, tags: imgTags }
  })

export const addTag = createServerFn({ method: 'POST' })
  .inputValidator((data: { imageId: number; tagName: string }) => data)
  .handler(async ({ data }) => {
    // Get or create tag
    let tag = db
      .select()
      .from(tags)
      .where(eq(tags.name, data.tagName.trim().toLowerCase()))
      .get()
    if (!tag) {
      tag = db
        .insert(tags)
        .values({ name: data.tagName.trim().toLowerCase() })
        .returning()
        .get()
    }

    // Add image-tag link (ignore if already exists)
    db.insert(imageTags)
      .values({ imageId: data.imageId, tagId: tag.id })
      .onConflictDoNothing()
      .run()

    return tag
  })

export const removeTag = createServerFn({ method: 'POST' })
  .inputValidator((data: { imageId: number; tagId: number }) => data)
  .handler(async ({ data }) => {
    db.delete(imageTags)
      .where(and(eq(imageTags.imageId, data.imageId), eq(imageTags.tagId, data.tagId)))
      .run()
    return { success: true }
  })

export const listTags = createServerFn({ method: 'GET' }).handler(async () => {
  return db.select().from(tags).orderBy(tags.name).all()
})

export const listProjectsForFilter = createServerFn({ method: 'GET' }).handler(async () => {
  return db.select({ id: projects.id, name: projects.name }).from(projects).all()
})
