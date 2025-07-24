import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function PerformanceTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
          <CardDescription>
            Server performance analysis and trends
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Performance metrics coming soon...</p>
        </CardContent>
      </Card>
    </div>
  )
}