import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listJobs, cancelJobs, fetchQueueStatus } from '@/server/functions/generation'

export const Route = createFileRoute('/jobs/')({
  loader: async () => {
    const [jobs, queueStatus] = await Promise.all([listJobs(), fetchQueueStatus()])
    return { jobs, queueStatus }
  },
  component: JobsPage,
})

function JobsPage() {
  const { jobs, queueStatus } = Route.useLoaderData()
  const router = useRouter()
  const [cancelling, setCancelling] = useState<Set<number>>(new Set())

  const hasActive = jobs.some((j) => j.status === 'pending' || j.status === 'running')

  // Poll when active jobs exist
  useEffect(() => {
    if (!hasActive) return
    const interval = setInterval(() => router.invalidate(), 2000)
    return () => clearInterval(interval)
  }, [hasActive, router])

  async function handleCancel(jobId: number) {
    setCancelling((prev) => new Set([...prev, jobId]))
    await cancelJobs({ data: [jobId] })
    setCancelling((prev) => {
      const next = new Set(prev)
      next.delete(jobId)
      return next
    })
    router.invalidate()
  }

  const running = jobs.filter((j) => j.status === 'running')
  const pending = jobs.filter((j) => j.status === 'pending')
  const completed = jobs.filter((j) => j.status === 'completed')
  const failed = jobs.filter((j) => j.status === 'failed')
  const cancelled = jobs.filter((j) => j.status === 'cancelled')

  function statusBadge(status: string) {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      running: 'default',
      pending: 'secondary',
      completed: 'outline',
      failed: 'destructive',
      cancelled: 'secondary',
    }
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>
  }

  function progressBar(completed: number, total: number) {
    const pct = total > 0 ? (completed / total) * 100 : 0
    return (
      <div className="w-full bg-secondary rounded-full h-2">
        <div
          className="bg-primary h-2 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Jobs"
        description={`Queue: ${queueStatus.queueLength} pending, ${queueStatus.processing ? 'processing' : 'idle'}`}
      />

      <div className="space-y-6">
        {running.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Running</h2>
            <div className="space-y-2">
              {running.map((job) => (
                <Card key={job.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {statusBadge(job.status!)}
                        <span className="text-sm font-medium">Job #{job.id}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {job.completedCount}/{job.totalCount} images
                      </span>
                    </div>
                    {progressBar(job.completedCount ?? 0, job.totalCount ?? 1)}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {pending.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">Pending</h2>
            <div className="space-y-2">
              {pending.map((job) => (
                <Card key={job.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {statusBadge(job.status!)}
                        <span className="text-sm font-medium">Job #{job.id}</span>
                        <span className="text-xs text-muted-foreground">
                          {job.totalCount} images
                        </span>
                      </div>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleCancel(job.id)}
                        disabled={cancelling.has(job.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {(completed.length > 0 || failed.length > 0 || cancelled.length > 0) && (
          <section>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">History</h2>
            <div className="space-y-2">
              {[...completed, ...failed, ...cancelled].map((job) => (
                <Card key={job.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {statusBadge(job.status!)}
                        <span className="text-sm font-medium">Job #{job.id}</span>
                        <span className="text-xs text-muted-foreground">
                          {job.completedCount}/{job.totalCount} images
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(job.createdAt!).toLocaleString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {jobs.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg mb-2">No jobs yet</p>
            <p className="text-sm">Start a generation from a project page.</p>
          </div>
        )}
      </div>
    </div>
  )
}
