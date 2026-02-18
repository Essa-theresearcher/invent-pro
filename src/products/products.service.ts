import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductStatus } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { StockBalance } from '../sales/entities/stock-balance.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
    @InjectRepository(StockBalance)
    private stockBalanceRepository: Repository<StockBalance>,
  ) {}

  /**
   * Find all products with optional filtering
   */
  async findAll(filters?: { 
    search?: string; 
    category?: string;
    lowStock?: boolean;
    outOfStock?: boolean;
  }): Promise<Product[]> {
    const query = this.productsRepository.createQueryBuilder('product');

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

  /**
   * Create a new product
   */
  async create(createProductDto: CreateProductDto): Promise<Product> {
    const status = this.calculateStatus(createProductDto.stock, createProductDto.minStock);
    
    const product = new Product();
    product.name = createProductDto.name;
    product.sku = createProductDto.sku;
    product.category = createProductDto.category;
    product.unitPrice = createProductDto.price;
    product.stock = createProductDto.stock;
    product.minStock = createProductDto.minStock;
    product.status = status;
    product.isActive = true;
    
    if (createProductDto.description) product.description = createProductDto.description;
    if (createProductDto.imageUrl) product.imageUrl = createProductDto.imageUrl;
    
    return this.productsRepository.save(product);
  }

  /**
   * Update product
   */
  async update(id: string, updateData: Partial<CreateProductDto>): Promise<Product> {
    const product = await this.findOne(id);
    
    Object.assign(product, updateData);
    
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
    const query = this.productsRepository.createQueryBuilder('product')
      .leftJoinAndSelect(
        'stock_balances',
        'sb',
        'sb.productId = product.id AND sb.locationId = :locationId',
        { locationId }
      )
      .select([
        'product.id',
        'product.name',
        'product.sku',
        'product.category',
        'product.unitPrice',
        'product.stock',
        'product.minStock',
        'product.status',
        'product.isActive',
      ])
      .addSelect('COALESCE(sb.quantity, 0)', 'stockQuantity');

    if (filters?.search) {
      query.andWhere(
        '(product.name LIKE :search OR product.sku LIKE :search OR product.barcode LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters?.category) {
      query.andWhere('product.category = :category', { category: filters.category });
    }

    // Only show active products
    query.andWhere('product.isActive = :isActive', { isActive: true });

    query.orderBy('product.name', 'ASC');

    const products = await query.getRawMany();

    // Format the results - handle SQLite boolean (0/1) and string comparisons
    // Note: TypeORM getRawMany uses underscore naming for columns
    // The isActive filter is applied in the query, so products returned are active
    return products.map(p => ({
      id: p.product_id,
      name: p.product_name,
      sku: p.product_sku,
      category: p.product_category,
      unitPrice: parseFloat(p.product_unit_price) || 0,
      stock: parseInt(p.product_stock) || 0,
      minStock: parseInt(p.product_min_stock) || 0,
      status: p.product_status,
      // Default to true since query filters by isActive = true
      isActive: p.product_isActive !== 0 && p.product_isActive !== false && p.product_isActive !== '0',
      stockQuantity: parseInt(p.stockQuantity) || 0,
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
}
