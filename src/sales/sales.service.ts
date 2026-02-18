import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sale, SaleStatus } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { InventoryMovement, MovementType } from './entities/inventory-movement.entity';
import { StockBalance } from './entities/stock-balance.entity';
import { UserLocation } from './entities/user-location.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private saleRepository: Repository<Sale>,
    @InjectRepository(SaleItem)
    private saleItemRepository: Repository<SaleItem>,
    @InjectRepository(InventoryMovement)
    private movementRepository: Repository<InventoryMovement>,
    @InjectRepository(StockBalance)
    private stockBalanceRepository: Repository<StockBalance>,
    @InjectRepository(UserLocation)
    private userLocationRepository: Repository<UserLocation>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
  ) {}

  /**
   * Generate unique receipt number
   */
  private generateReceiptNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `RCP-${timestamp}-${random}`;
  }

  /**
   * Get cashier's assigned location
   * First checks user_locations table, then falls back to user's assignedLocationId
   */
  async getCashierLocation(cashierId: string): Promise<string> {
    // First try to find in user_locations table
    const userLocation = await this.userLocationRepository.findOne({
      where: { userId: cashierId },
    });

    if (userLocation) {
      return userLocation.locationId;
    }

    // Fallback: check user's assignedLocationId directly
    // Need to inject UsersRepository or find another way to get user
    const user = await this.userRepository.findOne({ where: { id: cashierId } });
    if (user && user.assignedLocationId) {
      return user.assignedLocationId;
    }

    throw new ForbiddenException('Cashier has no assigned location');
  }

  /**
   * Get product with stock balance at location
   */
  async getProductWithStock(productId: string, locationId: string): Promise<{
    product: Product;
    stockBalance: StockBalance;
  }> {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    let stockBalance = await this.stockBalanceRepository.findOne({
      where: { productId, locationId },
    });

    // Create stock balance if doesn't exist
    if (!stockBalance) {
      stockBalance = this.stockBalanceRepository.create({
        productId,
        locationId,
        quantity: 0,
      });
      await this.stockBalanceRepository.save(stockBalance);
    }

    return { product, stockBalance };
  }

  /**
   * Create a new sale with inventory updates (atomic transaction)
   */
  async createSale(createSaleDto: CreateSaleDto, cashier: User): Promise<Sale> {
    const { items, paymentMethod, discountPercent = 0, customerId, notes } = createSaleDto;

    // Get cashier's assigned location
    const locationId = await this.getCashierLocation(cashier.id);

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Validate all products and their stock
      const saleItemsData: any[] = [];
      let subtotal = 0;
      const taxRate = 0.1; // 10% tax

      for (const item of items) {
        const { product, stockBalance } = await this.getProductWithStock(
          item.productId,
          locationId
        );

        if (stockBalance.quantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${product.name}". Available: ${stockBalance.quantity}, Requested: ${item.quantity}`
          );
        }

        const unitPrice = Number(product.unitPrice);
        const discount = item.discountAmount || (discountPercent > 0 ? unitPrice * discountPercent / 100 : 0);
        const itemTotal = (unitPrice - discount) * item.quantity;
        const taxAmount = itemTotal * taxRate;

        saleItemsData.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
          costPrice: Number(product.costPrice),
          discountAmount: discount,
          taxAmount,
          totalAmount: itemTotal + taxAmount,
          product,
          stockBalance,
        });

        subtotal += itemTotal;
      }

      // Step 2: Calculate totals
      const taxAmount = subtotal * taxRate;
      const discountAmount = subtotal * discountPercent / 100;
      const totalAmount = subtotal + taxAmount - discountAmount;

      // Step 3: Create Sale
      const sale = this.saleRepository.create({
        receiptNumber: this.generateReceiptNumber(),
        locationId,
        cashierId: cashier.id,
        customerId,
        subtotal,
        taxAmount,
        discountAmount,
        totalAmount,
        paymentMethod,
        status: SaleStatus.COMPLETED,
        notes,
      });

      const savedSale = await queryRunner.manager.save(sale);

      // Step 4: Create Sale Items and Inventory Movements
      for (const itemData of saleItemsData) {
        // Create sale item
        const saleItem = this.saleItemRepository.create({
          saleId: savedSale.id,
          productId: itemData.productId,
          quantity: itemData.quantity,
          unitPrice: itemData.unitPrice,
          costPrice: itemData.costPrice,
          discountAmount: itemData.discountAmount,
          taxAmount: itemData.taxAmount,
          totalAmount: itemData.totalAmount,
        });
        await queryRunner.manager.save(saleItem);

        // Update stock balance
        const newQty = itemData.stockBalance.quantity - itemData.quantity;
        await queryRunner.manager.update(StockBalance, itemData.stockBalance.id, {
          quantity: newQty,
        });

        // Create inventory movement (SALE_OUT)
        const movement = this.movementRepository.create({
          productId: itemData.productId,
          locationId,
          type: MovementType.SALE_OUT,
          quantity: -itemData.quantity,
          referenceId: savedSale.id,
          referenceType: 'SALE',
          reason: 'Sale completed',
          previousQty: itemData.stockBalance.quantity,
          newQty,
          unitCost: itemData.costPrice,
          createdBy: cashier.id,
        });
        await queryRunner.manager.save(movement);
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Return complete sale with items
      const completeSale = await this.saleRepository.findOne({
        where: { id: savedSale.id },
        relations: ['items'],
      });
      
      if (!completeSale) {
        throw new Error('Failed to retrieve created sale');
      }
      
      return completeSale;
    } catch (error) {
      // Rollback on error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get sale by ID with items and product details
   */
  async getSaleById(saleId: string): Promise<Sale> {
    const sale = await this.saleRepository.findOne({
      where: { id: saleId },
      relations: ['items', 'items.product', 'cashier'],
    });

    if (!sale) {
      throw new NotFoundException(`Sale with ID ${saleId} not found`);
    }

    return sale;
  }

  /**
   * Get all sales by location
   */
  async getSalesByLocation(locationId: string, limit = 50): Promise<Sale[]> {
    return this.saleRepository.find({
      where: { locationId },
      relations: ['items', 'cashier'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Search products for POS (by name, SKU, or barcode)
   */
  async searchProducts(query: string, locationId: string): Promise<any[]> {
    const products = await this.productRepository
      .createQueryBuilder('product')
      .where('(product.name LIKE :query OR product.sku LIKE :query OR product.barcode LIKE :query)', {
        query: `%${query}%`,
      })
      .andWhere('product.isActive = :isActive', { isActive: true })
      .getMany();

    // Get stock balance for each product at the location
    const results = [];
    for (const product of products) {
      const stockBalance = await this.stockBalanceRepository.findOne({
        where: { productId: product.id, locationId },
      });

      results.push({
        ...product,
        unitPrice: Number(product.unitPrice),
        costPrice: Number(product.costPrice),
        stockQuantity: stockBalance?.quantity || 0,
      });
    }

    return results;
  }
}

