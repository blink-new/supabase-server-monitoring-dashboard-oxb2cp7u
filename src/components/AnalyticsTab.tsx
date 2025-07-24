import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AnalyticsTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Historical Analytics</CardTitle>
          <CardDescription>
            Historical data analysis and reporting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Analytics and reporting coming soon...</p>
        </CardContent>
      </Card>
    </div>
  )
}