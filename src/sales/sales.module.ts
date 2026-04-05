import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { InventoryMovement } from './entities/inventory-movement.entity';
import { StockBalance } from './entities/stock-balance.entity';
import { UserLocation } from './entities/user-location.entity';
import { StockRequest } from './entities/stock-request.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      SaleItem,
      InventoryMovement,
      StockBalance,
      UserLocation,
      StockRequest,
      Product,
      User,
    ]),
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}

