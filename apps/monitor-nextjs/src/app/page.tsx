import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, Server, Zap } from "lucide-react"
import { JobSubmissionForm } from "@/components/job-submission-form"

export default function Home() {
  return (
    <main className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Job Queue Monitor</h1>
        <p className="text-sm text-muted-foreground">
          Real-time monitoring and job submission
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Jobs</p>
              <p className="text-2xl font-bold">0</p>
            </div>
            <Activity className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Workers</p>
              <p className="text-2xl font-bold">0</p>
            </div>
            <Server className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <Badge variant="outline" className="mt-1">Starting</Badge>
            </div>
            <Zap className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>
      </div>

      <div className="flex justify-center">
        <JobSubmissionForm />
      </div>
    </main>
  )
}
