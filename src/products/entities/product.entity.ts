import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ProductStatus {
  IN_STOCK = 'in-stock',
  LOW_STOCK = 'low-stock',
  OUT_OF_STOCK = 'out-of-stock',
}

export enum ProductBaseUnitType {
  WEIGHT = 'WEIGHT',
  VOLUME = 'VOLUME',
  PIECE = 'PIECE',
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  sku: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  category: string;

  @Column({ nullable: true, unique: true })
  barcode: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'unit_price' })
  unitPrice: number;

  @Column({
    type: 'simple-enum',
    enum: ProductBaseUnitType,
    name: 'base_unit_type',
    default: ProductBaseUnitType.PIECE,
  })
  baseUnitType: ProductBaseUnitType;

  @Column({ name: 'base_unit_name', default: 'piece' })
  baseUnitName: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'price_per_base_unit', nullable: true })
  pricePerBaseUnit: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'price_half_unit', nullable: true })
  priceHalfUnit: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'price_quarter_unit', nullable: true })
  priceQuarterUnit: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'price_three_quarter_unit', nullable: true })
  priceThreeQuarterUnit: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'retail_price', nullable: true })
  retailPrice: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'wholesale_price', nullable: true })
  wholesalePrice: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'cost_price', nullable: true })
  costPrice: number;

  @Column({ nullable: true, name: 'image_url' })
  imageUrl: string;

  @Column({ type: 'decimal', precision: 12, scale: 3, default: 0 })
  stock: number;

  @Column({ type: 'decimal', precision: 12, scale: 3, name: 'min_stock', default: 10 })
  minStock: number;

  @Column({
    type: 'simple-enum',
    enum: ProductStatus,
    default: ProductStatus.IN_STOCK,
  })
  status: ProductStatus;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

