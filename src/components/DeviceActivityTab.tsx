import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function DeviceActivityTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Device Activity</CardTitle>
          <CardDescription>
            Monitor device activity and connectivity status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Device activity monitoring coming soon...</p>
        </CardContent>
      </Card>
    </div>
  )
}