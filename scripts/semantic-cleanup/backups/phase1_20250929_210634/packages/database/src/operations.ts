import { prisma } from './client.js'
import type { Job, JobHistory, Workflow } from './client.js'

// Common database operations for job queue functionality

export class JobOperations {
  static async create(data: Omit<Job, 'id' | 'created_at' | 'updated_at'>) {
    return prisma.job.create({ data: data as any })
  }

  static async findById(id: string) {
    return prisma.job.findUnique({ where: { id } })
  }

  static async updateStatus(id: string, status: string, data?: any) {
    return prisma.job.update({
      where: { id },
      data: {
        status,
        updated_at: new Date(),
        ...(data && { data })
      }
    })
  }

  static async findPending(limit = 10) {
    return prisma.job.findMany({
      where: { status: 'pending' },
      orderBy: [
        { priority: 'desc' },
        { created_at: 'asc' }
      ],
      take: limit
    })
  }
}

export class WorkflowOperations {
  static async create(data: Omit<Workflow, 'id' | 'created_at' | 'updated_at'>) {
    return prisma.workflow.create({ data: data as any })
  }

  static async findById(id: string) {
    return prisma.workflow.findUnique({ where: { id } })
  }

  static async findByName(name: string) {
    return prisma.workflow.findUnique({
      where: { name }
    })
  }

  static async findAll() {
    return prisma.workflow.findMany({
      orderBy: { created_at: 'desc' }
    })
  }
}

export class JobHistoryOperations {
  static async create(data: Omit<JobHistory, 'id' | 'created_at'>) {
    return prisma.job_history.create({ data: data as any })
  }

  static async findByJobId(jobId: string) {
    return prisma.job_history.findMany({
      where: { job_id: jobId },
      orderBy: { created_at: 'desc' }
    })
  }
}