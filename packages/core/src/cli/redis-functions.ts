#!/usr/bin/env node

// CLI tool for managing Redis functions

import { Command } from 'commander';
import { RedisFunctionInstaller } from '../redis-functions/installer.js';
import { logger } from '../utils/logger.js';

const program = new Command();

program
  .name('redis-functions')
  .description('Manage Redis functions for job orchestration')
  .version('1.0.0');

program
  .command('install')
  .description('Install or update Redis functions')
  .option('-u, --url <url>', 'Redis URL', process.env.REDIS_URL || 'redis://localhost:6379')
  .action(async options => {
    const installer = new RedisFunctionInstaller(options.url);
    try {
      const result = await installer.installOrUpdate();
      if (result.success) {
        logger.info('Functions installed:', result.functionsInstalled);
      } else {
        logger.error('Installation failed:', result.error);
        process.exit(1);
      }
    } catch (error) {
      logger.error('Error:', error);
      process.exit(1);
    } finally {
      await installer.close();
    }
  });

program
  .command('list')
  .description('List installed Redis functions')
  .option('-u, --url <url>', 'Redis URL', process.env.REDIS_URL || 'redis://localhost:6379')
  .action(async options => {
    const installer = new RedisFunctionInstaller(options.url);
    try {
      const functions = await installer.listFunctions();
      // eslint-disable-next-line no-console
      console.log('\nInstalled Redis Functions:');
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(functions, null, 2));
    } catch (error) {
      logger.error('Error:', error);
      process.exit(1);
    } finally {
      await installer.close();
    }
  });

program
  .command('delete')
  .description('Delete Redis functions')
  .option('-u, --url <url>', 'Redis URL', process.env.REDIS_URL || 'redis://localhost:6379')
  .action(async options => {
    const installer = new RedisFunctionInstaller(options.url);
    try {
      await installer.deleteFunction();
      logger.info('Functions deleted successfully');
    } catch (error) {
      logger.error('Error:', error);
      process.exit(1);
    } finally {
      await installer.close();
    }
  });

program
  .command('test')
  .description('Test Redis functions with sample data')
  .option('-u, --url <url>', 'Redis URL', process.env.REDIS_URL || 'redis://localhost:6379')
  .action(async options => {
    const installer = new RedisFunctionInstaller(options.url);
    try {
      await installer.testFunction();
      logger.info('Function tests completed');
    } catch (error) {
      logger.error('Error:', error);
      process.exit(1);
    } finally {
      await installer.close();
    }
  });

program.parse();
