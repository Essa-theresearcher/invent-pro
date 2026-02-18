import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ProductStatus {
  IN_STOCK = 'in-stock',
  LOW_STOCK = 'low-stock',
  OUT_OF_STOCK = 'out-of-stock',
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

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'cost_price', nullable: true })
  costPrice: number;

  @Column({ nullable: true, name: 'image_url' })
  imageUrl: string;

  @Column({ type: 'int', default: 0 })
  stock: number;

  @Column({ type: 'int', name: 'min_stock', default: 10 })
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

