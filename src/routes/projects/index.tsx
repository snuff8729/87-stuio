import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { listProjects, createProject, deleteProject } from '@/server/functions/projects'

export const Route = createFileRoute('/projects/')({
  loader: () => listProjects(),
  component: ProjectsPage,
})

function ProjectsPage() {
  const projectList = Route.useLoaderData()
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  async function handleCreate() {
    if (!name.trim()) return
    const result = await createProject({
      data: { name: name.trim(), description: description.trim() || undefined },
    })
    setName('')
    setDescription('')
    setShowCreate(false)
    router.navigate({ to: '/projects/$projectId', params: { projectId: String(result.id) } })
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this project? Generated images will be preserved on disk.')) return
    await deleteProject({ data: id })
    router.invalidate()
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Manage your image generation projects"
        actions={
          <Button onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : 'New Project'}
          </Button>
        }
      />

      {showCreate && (
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="proj-name">Name</Label>
              <Input
                id="proj-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Character A - Full Set"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-desc">Description (optional)</Label>
              <Textarea
                id="proj-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe this project..."
                rows={2}
              />
            </div>
            <Button onClick={handleCreate} disabled={!name.trim()}>
              Create Project
            </Button>
          </CardContent>
        </Card>
      )}

      {projectList.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">No projects yet</p>
          <p className="text-sm">Create your first project to start generating images.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projectList.map((project) => (
            <Card key={project.id} className="group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: String(project.id) }}
                  >
                    <CardTitle className="text-base hover:text-primary transition-colors cursor-pointer">
                      {project.name}
                    </CardTitle>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDelete(project.id)}
                    className="opacity-0 group-hover:opacity-100 text-destructive"
                  >
                    &times;
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {project.description || 'No description'}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Created {new Date(project.createdAt!).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
