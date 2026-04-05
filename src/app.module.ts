import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { HealthModule } from './health/health.module';
import { SalesModule } from './sales/sales.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { LocationsModule } from './locations/locations.module';
import configuration from './config/configuration';

// Entities
import { User } from './users/entities/user.entity';
import { Product } from './products/entities/product.entity';
import { Category } from './categories/entities/category.entity';
import { Location } from './locations/entities/location.entity';
import { Sale } from './sales/entities/sale.entity';
import { SaleItem } from './sales/entities/sale-item.entity';
import { InventoryMovement } from './sales/entities/inventory-movement.entity';
import { StockBalance } from './sales/entities/stock-balance.entity';
import { UserLocation } from './sales/entities/user-location.entity';
import { StockRequest } from './sales/entities/stock-request.entity';

@Module({
  imports: [
    // Serve static files from MANAGEMENT folder
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'MANAGEMENT'),
      serveRoot: '/',
      exclude: ['/api*'],
    }),

    // Configuration module
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // TypeORM PostgreSQL connection
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432', 10) || 5432,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        entities: [
          User,
          UserLocation,
          Product,
          Category,
          Location,
          Sale,
          SaleItem,
          InventoryMovement,
          StockBalance,
          StockRequest,
        ],
        synchronize: true,
        logging: false,
      }),
      inject: [ConfigService],
    }),

// Feature modules
    HealthModule,
    SalesModule,
    UsersModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    LocationsModule,
  ],
})
export class AppModule {}

