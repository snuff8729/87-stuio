import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { listProjects } from '@/server/functions/projects'
import { listJobs } from '@/server/functions/generation'
import { createServerFn } from '@tanstack/react-start'
import { db } from '@/server/db'
import { generatedImages } from '@/server/db/schema'
import { desc } from 'drizzle-orm'

const getRecentImages = createServerFn({ method: 'GET' }).handler(async () => {
  return db
    .select()
    .from(generatedImages)
    .orderBy(desc(generatedImages.createdAt))
    .limit(12)
    .all()
})

export const Route = createFileRoute('/')({
  loader: async () => {
    const [projectList, jobs, images] = await Promise.all([
      listProjects(),
      listJobs(),
      getRecentImages(),
    ])
    return {
      projects: projectList.slice(0, 5),
      activeJobs: jobs.filter(
        (j) => j.status === 'running' || j.status === 'pending',
      ),
      recentImages: images,
    }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { projects, activeJobs, recentImages } = Route.useLoaderData()

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your projects and recent activity"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Projects</CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects yet.</p>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => (
                  <Link
                    key={p.id}
                    to="/projects/$projectId"
                    params={{ projectId: String(p.id) }}
                    className="block text-sm hover:text-primary transition-colors"
                  >
                    {p.name}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {activeJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active jobs.</p>
            ) : (
              <div className="space-y-2">
                {activeJobs.map((j) => (
                  <div key={j.id} className="flex items-center justify-between">
                    <span className="text-sm">Job #{j.id}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={j.status === 'running' ? 'default' : 'secondary'}>
                        {j.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {j.completedCount}/{j.totalCount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Images</CardTitle>
          </CardHeader>
          <CardContent>
            {recentImages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No images generated yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {recentImages.slice(0, 9).map((img) => (
                  <div
                    key={img.id}
                    className="aspect-square rounded-md bg-secondary overflow-hidden"
                  >
                    {img.thumbnailPath && (
                      <img
                        src={`/api/thumbnails/${img.thumbnailPath.replace('data/thumbnails/', '')}`}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
