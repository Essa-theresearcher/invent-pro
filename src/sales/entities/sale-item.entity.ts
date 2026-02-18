import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Sale } from './sale.entity';

@Entity('sale_items')
export class SaleItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sale_id' })
  saleId: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column()
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'unit_price' })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'cost_price' })
  costPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'discount_amount', default: 0 })
  discountAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'tax_amount', default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'total_amount' })
  totalAmount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Sale, (sale) => sale.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;
}

