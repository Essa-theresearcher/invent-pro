import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

interface CheckResult {
  status: string;
  error?: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'Application is healthy' })
  @ApiResponse({ status: 503, description: 'Application is unhealthy' })
  async healthCheck() {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };

    return health;
  }

  @Get('db')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Database health check with SELECT 1' })
  @ApiResponse({ status: 200, description: 'Database connection is healthy' })
  @ApiResponse({ status: 503, description: 'Database connection failed' })
  async databaseHealthCheck() {
    const startTime = Date.now();
    
    try {
      // Execute SELECT 1 query
      const result = await this.dataSource.query('SELECT 1 AS result');
      const responseTime = Date.now() - startTime;

      const health = {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        queryResult: result[0],
      };

      return health;
    } catch (error) {
      const health = {
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
        error: error.message,
      };

      // Return 503 status code for unhealthy database
      return {
        ...health,
        statusCode: 503,
      };
    }
  }

  @Get('ready')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Readiness check (includes DB check)' })
  @ApiResponse({ status: 200, description: 'Application is ready' })
  @ApiResponse({ status: 503, description: 'Application is not ready' })
  async readinessCheck() {
    
    const checks: { app: CheckResult; database: CheckResult } = {
      app: { status: 'ok' },
      database: { status: 'pending' },
    };

    // Check database
    try {
      await this.dataSource.query('SELECT 1');
      checks.database.status = 'ok';
    } catch (error) {
      checks.database.status = 'error';
      checks.database.error = error.message;
    }

    const allHealthy = Object.values(checks).every((check) => check.status === 'ok');

    return {
      status: allHealthy ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}

