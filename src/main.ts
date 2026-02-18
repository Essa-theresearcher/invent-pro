import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { Request, Response, NextFunction } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve static files from MANAGEMENT folder
  app.useStaticAssets(join(__dirname, '..', '..', 'MANAGEMENT'), {
    prefix: '/',
  });

  // Force redirect from root to login page
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/') {
      return res.redirect('/login.html');
    }
    next();
  });

  // Security middleware - CSP configured to allow inline scripts for frontend
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disable CSP for development
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS configuration
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  const apiPrefix = process.env.API_PREFIX || 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Inventory POS System API')
    .setDescription('Production-grade Multi-Store Inventory Management + POS System')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Health', 'System health check endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/docs`);
  console.log(`🔍 Health Check: http://localhost:${port}/${apiPrefix}/health`);
}

bootstrap();

