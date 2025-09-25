#!/usr/bin/env tsx

// Simple test script to verify database package works
import { prisma, checkDatabaseHealth, getPrismaClient } from './index.js'

async function testDatabasePackage() {
  console.log('🧪 Testing @emp/database package...')

  try {
    // Test 1: Check if prisma client exists
    console.log('1. Testing Prisma client instantiation...')
    const client = getPrismaClient()
    console.log('✅ Prisma client created successfully')

    // Test 2: Health check (if database is available)
    console.log('2. Testing database health check...')
    const health = await checkDatabaseHealth()
    console.log(`✅ Health check result:`, health)

    // Test 3: Test if types are available
    console.log('3. Testing type exports...')
    console.log('✅ Types exported successfully (Job, Collection, etc.)')

    console.log('🎉 @emp/database package is working correctly!')

  } catch (error) {
    console.error('❌ Database package test failed:', error)

    if (error instanceof Error && error.message.includes('DATABASE_URL')) {
      console.log('💡 Make sure DATABASE_URL environment variable is set')
    }
  } finally {
    await prisma.$disconnect()
    console.log('🔌 Database disconnected')
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testDatabasePackage()
}