import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  LayoutDashboard, 
  Car, 
  FileText,
  Activity,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import OperationsDashboard from '@/components/OperationsDashboard';
import FleetManagement from '@/components/FleetManagement';
import LogsHistory from '@/components/LogsHistory';
import './App.css';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-blue-600 rounded-lg">
                <Activity className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  Honda Fleet Monitoring
                </h1>
                <p className="text-sm text-gray-500">
                  Vehicle Tracking Operations Portal
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-gray-600">System Online</span>
              </div>
              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                Operations Ready
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs defaultValue="dashboard" className="space-y-6">
          {/* Tab Navigation */}
          <div className="bg-white rounded-lg border border-gray-200 p-1">
            <TabsList className="grid w-full grid-cols-3 bg-transparent gap-1">
              <TabsTrigger 
                value="dashboard" 
                className="flex items-center gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Operations Dashboard</span>
                <span className="sm:hidden">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger 
                value="fleet" 
                className="flex items-center gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
              >
                <Car className="h-4 w-4" />
                <span className="hidden sm:inline">Fleet Management</span>
                <span className="sm:hidden">Fleet</span>
              </TabsTrigger>
              <TabsTrigger 
                value="logs" 
                className="flex items-center gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Logs &amp; History</span>
                <span className="sm:hidden">Logs</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-lg border border-gray-200">
            <TabsContent value="dashboard" className="p-6 m-0">
              <OperationsDashboard />
            </TabsContent>

            <TabsContent value="fleet" className="p-6 m-0">
              <FleetManagement />
            </TabsContent>

            <TabsContent value="logs" className="p-6 m-0">
              <LogsHistory />
            </TabsContent>
          </div>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-4 py-4 mt-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-sm text-gray-500">
              Honda Fleet Monitoring Portal - Vehicle Tracking Operations
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Firebase Connected</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>API Connected</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;