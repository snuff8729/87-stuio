import { createServerFn } from '@tanstack/react-start'
import { db } from '../db'
import { generationJobs, projectScenes, projects } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { synthesizePrompts } from '../services/prompt'
import { enqueueJob, cancelPendingJobs, getQueueStatus } from '../services/generation'

export const createGenerationJob = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      projectId: number
      projectSceneIds: number[]
      countPerScene: number
    }) => data,
  )
  .handler(async ({ data }) => {
    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .get()
    const parameters = JSON.parse(project?.parameters || '{}')

    const jobs = []

    for (const sceneId of data.projectSceneIds) {
      const prompts = synthesizePrompts(data.projectId, sceneId)

      const scene = db
        .select()
        .from(projectScenes)
        .where(eq(projectScenes.id, sceneId))
        .get()

      const job = db
        .insert(generationJobs)
        .values({
          projectId: data.projectId,
          projectSceneId: sceneId,
          sourceSceneId: scene?.sourceSceneId,
          resolvedPrompts: JSON.stringify(prompts),
          resolvedParameters: JSON.stringify(parameters),
          totalCount: data.countPerScene,
          completedCount: 0,
          status: 'pending',
        })
        .returning()
        .get()

      enqueueJob(job.id)
      jobs.push(job)
    }

    return jobs
  })

export const listJobs = createServerFn({ method: 'GET' }).handler(async () => {
  return db
    .select()
    .from(generationJobs)
    .orderBy(desc(generationJobs.createdAt))
    .limit(100)
    .all()
})

export const getJobStatus = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    return db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, id))
      .get()
  })

export const cancelJobs = createServerFn({ method: 'POST' })
  .inputValidator((jobIds: number[]) => jobIds)
  .handler(async ({ data: jobIds }) => {
    cancelPendingJobs(jobIds)
    return { success: true }
  })

export const fetchQueueStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    return getQueueStatus()
  },
)
