import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductStatus, ProductBaseUnitType } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { StockBalance } from '../sales/entities/stock-balance.entity';
import { LocationsService } from '../locations/locations.service';
import { Role } from '../users/entities/user.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(StockBalance)
    private stockBalanceRepository: Repository<StockBalance>,
    private locationsService: LocationsService,
  ) {}

  /**
   * Find all products with optional filtering
   */
  async findAll(filters?: { 
    search?: string; 
    category?: string;
    lowStock?: boolean;
    outOfStock?: boolean;
    includeInactive?: boolean;
    actor?: { role?: string; assignedLocationId?: string | null; assigned_location_id?: string | null };
  }): Promise<any[]> {
    const actor = filters?.actor;
    const actorRole = actor?.role;
    const actorLocationId = actor?.assignedLocationId ?? actor?.assigned_location_id ?? null;

    if (actorRole && actorRole !== Role.OWNER && actorLocationId) {
      return this.findAllByLocation(actorLocationId, {
        search: filters?.search,
        category: filters?.category,
      });
    }

    const query = this.productsRepository.createQueryBuilder('product');

    // By default, hide inactive products (safe deletion behavior)
    if (!filters?.includeInactive) {
      query.andWhere('product.isActive = :isActive', { isActive: true });
    }

    if (filters?.search) {
      query.andWhere(
        '(product.name LIKE :search OR product.sku LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters?.category) {
      query.andWhere('product.category = :category', { category: filters.category });
    }

    if (filters?.lowStock) {
      query.andWhere('product.stock > 0 AND product.stock < product.minStock');
    }

    if (filters?.outOfStock) {
      query.andWhere('product.stock = 0');
    }

    query.orderBy('product.name', 'ASC');

    return query.getMany();
  }

  /**
   * Find product by ID
   */
  async findOne(id: string): Promise<Product> {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return product;
  }

  private normalizeLocationName(name?: string): string {
    return String(name || '').trim().toUpperCase();
  }

  private async getMainLocationIdStrict(): Promise<string> {
    const allLocations = await this.locationsService.findAll();
    const main = allLocations.find((l: any) => {
      const n = this.normalizeLocationName(l?.name);
      return n === 'MAIN' || n === 'MAIN STORE' || n === 'INSHAR MAIN';
    }) || allLocations.find((l: any) => this.normalizeLocationName(l?.name).includes('MAIN'));

    if (!main?.id) {
      throw new BadRequestException('MAIN location not found');
    }
    return String(main.id);
  }

  /**
   * Create a new product
   */
  async create(createProductDto: CreateProductDto, actor?: { id: string; role?: string; assignedLocationId?: string | null }): Promise<Product> {
    const status = this.calculateStatus(createProductDto.stock, createProductDto.minStock);

    // Enforce branch restriction:
    // Branch users cannot create a brand-new catalog item not already existing in MAIN.
    if (actor?.id) {
      const mainLocationId = await this.getMainLocationIdStrict();

      if (actor.assignedLocationId && String(actor.assignedLocationId) !== String(mainLocationId)) {
        const sku = String(createProductDto.sku || '').trim();
        const name = String(createProductDto.name || '').trim();

        const existing = await this.productsRepository.findOne({
          where: [
            ...(sku ? [{ sku }] as any : []),
            ...(name ? [{ name }] as any : []),
          ],
        });

        if (!existing) {
          throw new ForbiddenException(
            'Branch stores cannot add new items that do not exist in INSHAR MAIN. Request item creation in MAIN first.'
          );
        }
      }
    }
    
    const duplicate = await this.productsRepository.findOne({
      where: [
        { sku: createProductDto.sku },
        { name: createProductDto.name },
      ],
    });

    if (duplicate) {
      throw new ConflictException(
        `Product with SKU "${createProductDto.sku}" or name "${createProductDto.name}" already exists`
      );
    }

    const product = new Product();
    product.name = createProductDto.name;
    product.sku = createProductDto.sku;
    product.category = createProductDto.category;
    product.unitPrice = createProductDto.price;
    product.stock = createProductDto.stock;
    product.minStock = createProductDto.minStock;
    product.status = status;
    product.isActive = true;
    product.retailPrice = createProductDto.retailPrice ?? createProductDto.price;
    product.wholesalePrice = createProductDto.wholesalePrice ?? null;

    product.baseUnitType = createProductDto.baseUnitType || ProductBaseUnitType.PIECE;
    product.baseUnitName = createProductDto.baseUnitName || (product.baseUnitType === ProductBaseUnitType.WEIGHT ? 'kg' : product.baseUnitType === ProductBaseUnitType.VOLUME ? 'litre' : 'piece');
    product.pricePerBaseUnit = createProductDto.pricePerBaseUnit ?? createProductDto.price;
    if (product.baseUnitType === ProductBaseUnitType.WEIGHT) {
      const base = Number(product.pricePerBaseUnit || createProductDto.price || 0);
      product.priceQuarterUnit = Number((base * 0.25).toFixed(2));
      product.priceHalfUnit = Number((base * 0.5).toFixed(2));
      product.priceThreeQuarterUnit = Number((base * 0.75).toFixed(2));
    } else {
      product.priceHalfUnit = createProductDto.priceHalfUnit ?? null;
      product.priceQuarterUnit = createProductDto.priceQuarterUnit ?? null;
      product.priceThreeQuarterUnit = createProductDto.priceThreeQuarterUnit ?? null;
    }
    
    if (createProductDto.description) product.description = createProductDto.description;
    if (createProductDto.imageUrl) product.imageUrl = createProductDto.imageUrl;
    
    return this.productsRepository.save(product);
  }

  /**
   * Update product
   */
  async update(id: string, updateData: Partial<CreateProductDto>): Promise<Product> {
    const product = await this.findOne(id);

    if (updateData.name !== undefined) product.name = updateData.name;
    if (updateData.sku !== undefined) product.sku = updateData.sku;
    if (updateData.category !== undefined) product.category = updateData.category;
    if (updateData.description !== undefined) product.description = updateData.description;
    if (updateData.imageUrl !== undefined) product.imageUrl = updateData.imageUrl;

    if (updateData.price !== undefined) {
      product.unitPrice = updateData.price;
      if (updateData.retailPrice === undefined) {
        product.retailPrice = updateData.price;
      }
      if (updateData.pricePerBaseUnit === undefined) {
        product.pricePerBaseUnit = updateData.price;
      }
    }

    if (updateData.stock !== undefined) product.stock = updateData.stock;
    if (updateData.minStock !== undefined) product.minStock = updateData.minStock;

    if (updateData.baseUnitType !== undefined) product.baseUnitType = updateData.baseUnitType;
    if (updateData.baseUnitName !== undefined) product.baseUnitName = updateData.baseUnitName;
    if (updateData.pricePerBaseUnit !== undefined) product.pricePerBaseUnit = updateData.pricePerBaseUnit;
    if (updateData.priceHalfUnit !== undefined) product.priceHalfUnit = updateData.priceHalfUnit;
    if (updateData.priceQuarterUnit !== undefined) product.priceQuarterUnit = updateData.priceQuarterUnit;
    if (updateData.priceThreeQuarterUnit !== undefined) product.priceThreeQuarterUnit = updateData.priceThreeQuarterUnit;
    if (updateData.retailPrice !== undefined) product.retailPrice = updateData.retailPrice;
    if (updateData.wholesalePrice !== undefined) product.wholesalePrice = updateData.wholesalePrice;

    if ((product.baseUnitType || ProductBaseUnitType.PIECE) === ProductBaseUnitType.WEIGHT) {
      const base = Number(product.pricePerBaseUnit ?? product.unitPrice ?? 0);
      product.priceQuarterUnit = Number((base * 0.25).toFixed(2));
      product.priceHalfUnit = Number((base * 0.5).toFixed(2));
      product.priceThreeQuarterUnit = Number((base * 0.75).toFixed(2));
    }

    // Recalculate status if stock or minStock changed
    if (updateData.stock !== undefined || updateData.minStock !== undefined) {
      product.status = this.calculateStatus(product.stock, product.minStock);
    }

    return this.productsRepository.save(product);
  }

  /**
   * Adjust stock
   */
  async adjustStock(id: string, adjustment: { type: 'add' | 'remove' | 'set'; quantity: number }): Promise<Product> {
    const product = await this.findOne(id);
    
    if (adjustment.type === 'add') {
      product.stock += adjustment.quantity;
    } else if (adjustment.type === 'remove') {
      product.stock = Math.max(0, product.stock - adjustment.quantity);
    } else {
      product.stock = adjustment.quantity;
    }
    
    product.status = this.calculateStatus(product.stock, product.minStock);
    return this.productsRepository.save(product);
  }

  /**
   * Delete product
   */
  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    await this.productsRepository.remove(product);
  }

  /**
   * Soft-deactivate product (safe delete)
   */
  async deactivate(id: string): Promise<Product> {
    const product = await this.findOne(id);
    product.isActive = false;
    return this.productsRepository.save(product);
  }

  private calculateStatus(stock: number, minStock: number): ProductStatus {
    if (stock === 0) return ProductStatus.OUT_OF_STOCK;
    if (stock < minStock) return ProductStatus.LOW_STOCK;
    return ProductStatus.IN_STOCK;
  }

  /**
   * Find products with stock at a specific location
   * This is used by the POS to show available products
   */
  async findAllByLocation(locationId: string, filters?: {
    search?: string;
    category?: string;
  }): Promise<any[]> {
    const query = this.productsRepository.createQueryBuilder('product');

    // Only show active products
    query.where('product.isActive = :isActive', { isActive: true });

    if (filters?.search) {
      query.andWhere(
        '(product.name LIKE :search OR product.sku LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters?.category) {
      query.andWhere('product.category = :category', { category: filters.category });
    }

    query.orderBy('product.name', 'ASC');

    const products = await query.getMany();

    const balances = await this.stockBalanceRepository.find({
      where: { locationId },
    });
    const balanceMap = new Map<string, number>(
      balances.map((b) => [String(b.productId), Number(b.quantity || 0)])
    );

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      unitPrice: Number(p.unitPrice || 0),
      baseUnitType: p.baseUnitType || 'PIECE',
      baseUnitName: p.baseUnitName || 'piece',
      pricePerBaseUnit: p.pricePerBaseUnit != null ? Number(p.pricePerBaseUnit) : Number(p.unitPrice || 0),
      priceHalfUnit: p.priceHalfUnit != null ? Number(p.priceHalfUnit) : null,
      priceQuarterUnit: p.priceQuarterUnit != null ? Number(p.priceQuarterUnit) : null,
      priceThreeQuarterUnit: p.priceThreeQuarterUnit != null ? Number(p.priceThreeQuarterUnit) : null,
      retailPrice: p.retailPrice != null ? Number(p.retailPrice) : Number(p.unitPrice || 0),
      wholesalePrice: p.wholesalePrice != null ? Number(p.wholesalePrice) : null,
      stock: Number(p.stock || 0),
      minStock: Number(p.minStock || 0),
      status: p.status,
      isActive: p.isActive !== false,
      stockQuantity: balanceMap.get(String(p.id)) ?? 0,
    }));
  }

  /**
   * Initialize stock for a product at a location
   */
  async initializeStockAtLocation(productId: string, locationId: string, initialStock: number): Promise<void> {
    const existing = await this.stockBalanceRepository.findOne({
      where: { productId, locationId },
    });

    if (!existing) {
      const stockBalance = this.stockBalanceRepository.create({
        productId,
        locationId,
        quantity: initialStock,
      });
      await this.stockBalanceRepository.save(stockBalance);
    }
  }

  /**
   * Reconcile global product stock from default single location (Main Store)
   * Useful when historical data left product.stock out of sync with stock_balances
   */
  async reconcileGlobalStockFromDefaultLocation(): Promise<{ updated: number; locationId: string }> {
    const defaultLocation = await this.locationsService.getOrCreateDefault();
    const locationId = String(defaultLocation.id);

    const allProducts = await this.productsRepository.find();
    let updated = 0;

    for (const product of allProducts) {
      const stockBalance = await this.stockBalanceRepository.findOne({
        where: { productId: product.id, locationId },
      });

      const reconciledStock = stockBalance?.quantity || 0;
      const reconciledStatus = this.calculateStatus(reconciledStock, product.minStock || 0);

      if (product.stock !== reconciledStock || product.status !== reconciledStatus) {
        product.stock = reconciledStock;
        product.status = reconciledStatus;
        await this.productsRepository.save(product);
        updated++;
      }
    }

    return { updated, locationId };
  }
}
