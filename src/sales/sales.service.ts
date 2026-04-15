import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sale, SaleStatus } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { InventoryMovement, MovementType } from './entities/inventory-movement.entity';
import { StockBalance } from './entities/stock-balance.entity';
import { UserLocation } from './entities/user-location.entity';
import { StockRequest, StockRequestStatus } from './entities/stock-request.entity';
import { CreateSaleDto, SaleUnit } from './dto/create-sale.dto';
import { User, Role } from '../users/entities/user.entity';
import { Product, ProductStatus } from '../products/entities/product.entity';

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
    @InjectRepository(StockRequest)
    private stockRequestRepository: Repository<StockRequest>,
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
      const mainLocationId = await this.getMainLocationId();
      const shouldUpdateGlobalStock = String(locationId) === String(mainLocationId);

      for (const item of items) {
        const { product, stockBalance } = await this.getProductWithStock(
          item.productId,
          locationId
        );

        const saleUnit = item.saleUnit || (product.baseUnitType === 'PIECE' ? SaleUnit.PIECE : SaleUnit.FULL);
        const defaultFactor = saleUnit === SaleUnit.HALF ? 0.5 : saleUnit === SaleUnit.QUARTER ? 0.25 : 1;
        const baseQtyFactor = item.baseQtyFactor || defaultFactor;
        const requiredBaseQty = Number(item.quantity) * Number(baseQtyFactor);

        if (Number(stockBalance.quantity) < requiredBaseQty) {
          throw new BadRequestException(
            `Insufficient stock for "${product.name}". Available: ${stockBalance.quantity}, Requested: ${requiredBaseQty}`
          );
        }

        let unitPrice = Number(product.pricePerBaseUnit ?? product.unitPrice);
        if (saleUnit === SaleUnit.HALF) {
          unitPrice = Number(product.priceHalfUnit ?? unitPrice * 0.5);
        } else if (saleUnit === SaleUnit.QUARTER) {
          unitPrice = Number(product.priceQuarterUnit ?? unitPrice * 0.25);
        } else if (saleUnit === SaleUnit.PIECE) {
          unitPrice = Number(product.pricePerBaseUnit ?? product.unitPrice);
        }

        const discount = item.discountAmount || (discountPercent > 0 ? unitPrice * discountPercent / 100 : 0);
        const itemTotal = (unitPrice - discount) * Number(item.quantity);
        const taxAmount = itemTotal * taxRate;

        const safeCostPrice = Number(product.costPrice ?? 0);

        saleItemsData.push({
          productId: item.productId,
          quantity: Number(item.quantity),
          saleUnit,
          baseQtyFactor: Number(baseQtyFactor),
          requiredBaseQty,
          unitPrice,
          costPrice: Number.isFinite(safeCostPrice) ? safeCostPrice : 0,
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
          saleUnit: itemData.saleUnit,
          baseQtyFactor: itemData.baseQtyFactor,
          unitPrice: itemData.unitPrice,
          costPrice: itemData.costPrice,
          discountAmount: itemData.discountAmount,
          taxAmount: itemData.taxAmount,
          totalAmount: itemData.totalAmount,
        });
        await queryRunner.manager.save(saleItem);

        // Update location stock balance
        const newQty = Number((Number(itemData.stockBalance.quantity) - Number(itemData.requiredBaseQty)).toFixed(3));
        await queryRunner.manager.update(StockBalance, itemData.stockBalance.id, {
          quantity: newQty,
        });

        // Update global product stock only when sale is made at MAIN location.
        // Branch sales must only affect branch stock balances and should not reduce MAIN/global stock.
        if (shouldUpdateGlobalStock) {
          const currentGlobalStock = Number(itemData.product.stock || 0);
          const updatedGlobalStock = Math.max(0, currentGlobalStock - Number(itemData.requiredBaseQty));

          let updatedStatus = itemData.product.status;
          if (updatedGlobalStock === 0) {
            updatedStatus = ProductStatus.OUT_OF_STOCK;
          } else if (updatedGlobalStock < Number(itemData.product.minStock || 0)) {
            updatedStatus = ProductStatus.LOW_STOCK;
          } else {
            updatedStatus = ProductStatus.IN_STOCK;
          }

          await queryRunner.manager.update(Product, itemData.productId, {
            stock: updatedGlobalStock,
            status: updatedStatus,
          });
        }

        // Create inventory movement (SALE_OUT)
        const movementQuantity = Number((-Number(itemData.requiredBaseQty)).toFixed(3));
        const movementPreviousQty = Number(Number(itemData.stockBalance.quantity).toFixed(3));
        const movementNewQty = Number(Number(newQty).toFixed(3));

        const movement = this.movementRepository.create({
          productId: itemData.productId,
          locationId,
          type: MovementType.SALE_OUT,
          quantity: movementQuantity,
          referenceId: savedSale.id,
          referenceType: 'SALE',
          reason: 'Sale completed',
          previousQty: movementPreviousQty,
          newQty: movementNewQty,
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
      relations: ['items', 'items.product', 'location'],
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
      relations: ['items'],  
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

  private async getMainLocationId(): Promise<string> {
    const locationRepo = this.dataSource.getRepository('Location');
    const locations = await locationRepo.createQueryBuilder('l').getMany() as any[];

    const normalized = (v: string) => String(v || '').trim().toUpperCase();

    // Prefer INSHAR MAIN as canonical source first
    const preferred = locations.find((l: any) => normalized(l?.name) === 'INSHAR MAIN')
      || locations.find((l: any) => {
        const n = normalized(l?.name);
        return n === 'MAIN' || n === 'MAIN STORE';
      });

    if (preferred?.id) {
      return String(preferred.id);
    }

    // Fallback: any location containing MAIN
    const containsMain = locations.find((l: any) => normalized(l?.name).includes('MAIN'));
    if (containsMain?.id) {
      return String(containsMain.id);
    }

    throw new BadRequestException('MAIN location not found');
  }

  async createStockRequest(
    requester: User,
    payload: { productId: string; quantity: number; note?: string },
  ): Promise<StockRequest> {
    const toLocationId = await this.getCashierLocation(requester.id);
    const fromLocationId = await this.getMainLocationId();

    if (toLocationId === fromLocationId) {
      throw new ForbiddenException('MAIN does not request stock from itself');
    }

    if (!payload.productId || !String(payload.productId).trim()) {
      throw new BadRequestException('productId is required');
    }

    if (!payload.quantity || Number(payload.quantity) <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }

    const product = await this.productRepository.findOne({ where: { id: payload.productId } });
    if (!product) throw new NotFoundException('Product not found');

    const request = this.stockRequestRepository.create({
      productId: payload.productId,
      fromLocationId,
      toLocationId,
      quantity: Number(payload.quantity),
      note: payload.note || undefined,
      status: StockRequestStatus.PENDING,
      requestedBy: requester.id,
    });

    return this.stockRequestRepository.save(request);
  }

  async listStockRequests(user: User, status?: StockRequestStatus): Promise<StockRequest[]> {
    const qb = this.stockRequestRepository
      .createQueryBuilder('sr')
      .orderBy('sr.createdAt', 'DESC');

    if (status) {
      qb.andWhere('sr.status = :status', { status });
    }

    if (user.role === Role.CASHIER) {
      qb.andWhere('sr.requestedBy = :requestedBy', { requestedBy: user.id });
    } else if (user.role === Role.MANAGER) {
      const managerLocationId = await this.getCashierLocation(user.id);
      qb.andWhere('sr.toLocationId = :toLocationId', { toLocationId: managerLocationId });
    }

    return qb.getMany();
  }

  async approveStockRequest(id: string, approver: User): Promise<StockRequest> {
    if (approver.role === Role.CASHIER) {
      throw new ForbiddenException('Cashier cannot approve stock requests');
    }

    if (approver.role === Role.MANAGER) {
      const approverLocationId = await this.getCashierLocation(approver.id);
      const mainLocationIdForManagerCheck = await this.getMainLocationId();
      if (approverLocationId !== mainLocationIdForManagerCheck) {
        throw new ForbiddenException('Only MAIN manager or owner can approve stock requests');
      }
    }

    const request = await this.stockRequestRepository.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Stock request not found');
    if (request.status !== StockRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be approved');
    }

    const mainLocationId = await this.getMainLocationId();
    if (request.fromLocationId !== mainLocationId) {
      throw new ForbiddenException('Only MAIN can be transfer source');
    }
    if (request.toLocationId === mainLocationId) {
      throw new ForbiddenException('MAIN cannot be transfer target');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let fromBalance = await queryRunner.manager.findOne(StockBalance, {
        where: { productId: request.productId, locationId: request.fromLocationId },
      });

      // Legacy-data fallback:
      // Some flows updated product.stock without creating/updating MAIN stock_balances.
      // If MAIN balance is missing, bootstrap it from product.stock.
      if (!fromBalance) {
        const productAtGlobal = await queryRunner.manager.findOne(Product, {
          where: { id: request.productId },
        });

        fromBalance = queryRunner.manager.create(StockBalance, {
          productId: request.productId,
          locationId: request.fromLocationId,
          quantity: Number(productAtGlobal?.stock || 0),
        });
        await queryRunner.manager.save(fromBalance);
      }

      if (Number(fromBalance.quantity) < Number(request.quantity)) {
        throw new BadRequestException('Insufficient MAIN stock');
      }

      let toBalance = await queryRunner.manager.findOne(StockBalance, {
        where: { productId: request.productId, locationId: request.toLocationId },
      });
      if (!toBalance) {
        toBalance = queryRunner.manager.create(StockBalance, {
          productId: request.productId,
          locationId: request.toLocationId,
          quantity: 0,
        });
        await queryRunner.manager.save(toBalance);
      }

      const fromPrev = Number(fromBalance.quantity);
      const toPrev = Number(toBalance.quantity);
      const qty = Number(request.quantity);

      fromBalance.quantity = fromPrev - qty;
      toBalance.quantity = toPrev + qty;

      await queryRunner.manager.save(fromBalance);
      await queryRunner.manager.save(toBalance);

      const outMove = this.movementRepository.create({
        productId: request.productId,
        locationId: request.fromLocationId,
        type: MovementType.TRANSFER_OUT,
        quantity: -qty,
        referenceId: request.id,
        referenceType: 'STOCK_REQUEST',
        reason: 'Approved transfer out from MAIN',
        previousQty: fromPrev,
        newQty: fromBalance.quantity,
        unitCost: 0,
        createdBy: approver.id,
      });

      const inMove = this.movementRepository.create({
        productId: request.productId,
        locationId: request.toLocationId,
        type: MovementType.TRANSFER_IN,
        quantity: qty,
        referenceId: request.id,
        referenceType: 'STOCK_REQUEST',
        reason: 'Approved transfer in to branch',
        previousQty: toPrev,
        newQty: toBalance.quantity,
        unitCost: 0,
        createdBy: approver.id,
      });

      await queryRunner.manager.save(outMove);
      await queryRunner.manager.save(inMove);

      request.status = StockRequestStatus.APPROVED;
      request.approvedBy = approver.id;
      request.approvedAt = new Date();
      await queryRunner.manager.save(request);

      await queryRunner.commitTransaction();
      return request;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async rejectStockRequest(id: string, approver: User, reason?: string): Promise<StockRequest> {
    if (approver.role === Role.CASHIER) {
      throw new ForbiddenException('Cashier cannot reject stock requests');
    }

    if (approver.role === Role.MANAGER) {
      const approverLocationId = await this.getCashierLocation(approver.id);
      const mainLocationIdForManagerCheck = await this.getMainLocationId();
      if (approverLocationId !== mainLocationIdForManagerCheck) {
        throw new ForbiddenException('Only MAIN manager or owner can reject stock requests');
      }
    }

    const request = await this.stockRequestRepository.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Stock request not found');
    if (request.status !== StockRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    request.status = StockRequestStatus.REJECTED;
    request.approvedBy = approver.id;
    request.approvedAt = new Date();
    request.rejectedReason = reason || undefined;

    return this.stockRequestRepository.save(request);
  }
}

