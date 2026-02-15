import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { getSetting, setSetting } from '@/server/functions/settings'

export const Route = createFileRoute('/settings/')({
  loader: async () => {
    const [apiKey, delay] = await Promise.all([
      getSetting({ data: 'nai_api_key' }),
      getSetting({ data: 'generation_delay' }),
    ])
    return { apiKey: apiKey ?? '', delay: delay ?? '500' }
  },
  component: SettingsPage,
})

function SettingsPage() {
  const { apiKey: initialApiKey, delay: initialDelay } = Route.useLoaderData()
  const [apiKey, setApiKey] = useState(initialApiKey)
  const [showKey, setShowKey] = useState(false)
  const [delay, setDelay] = useState(Number(initialDelay))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setApiKey(initialApiKey)
    setDelay(Number(initialDelay))
  }, [initialApiKey, initialDelay])

  async function handleSave() {
    setSaving(true)
    await Promise.all([
      setSetting({ data: { key: 'nai_api_key', value: apiKey } }),
      setSetting({ data: { key: 'generation_delay', value: String(delay) } }),
    ])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <PageHeader title="Settings" description="Configure your NAI API connection and generation preferences" />

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>NAI API Key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your NAI API key..."
                />
                <Button variant="outline" onClick={() => setShowKey(!showKey)}>
                  {showKey ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generation Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="delay">
                Delay between generations: <span className="font-mono text-primary">{delay}ms</span>
              </Label>
              <input
                id="delay"
                type="range"
                min={0}
                max={30000}
                step={100}
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0ms</span>
                <span>15s</span>
                <span>30s</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
