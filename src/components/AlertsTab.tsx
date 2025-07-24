import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AlertsTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Alert Management</CardTitle>
          <CardDescription>
            Monitor and manage system alerts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Alert management coming soon...</p>
        </CardContent>
      </Card>
    </div>
  )
}