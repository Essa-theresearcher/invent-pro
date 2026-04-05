import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { SaleItem } from './sale-item.entity';
import { User } from '../../users/entities/user.entity';
import { Location } from '../../locations/entities/location.entity';

export enum SaleStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  VOIDED = 'VOIDED',
  REFUNDED = 'REFUNDED',
}

@Entity('sales')
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, name: 'receipt_number' })
  receiptNumber: string;

  @Column({ name: 'location_id' })
  locationId: string;

@Column({ name: 'cashier_id' })
  cashierId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'cashier_id' })
  cashier: User;

  @ManyToOne(() => Location, { eager: false, nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @Column({ name: 'customer_id', nullable: true })
  customerId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'subtotal' })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'tax_amount' })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'discount_amount', default: 0 })
  discountAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'total_amount' })
  totalAmount: number;

  @Column({ name: 'payment_method' })
  paymentMethod: string;

  @Column({
    type: 'simple-enum',
    enum: SaleStatus,
    default: SaleStatus.PENDING,
  })
  status: SaleStatus;

  @Column({ nullable: true, name: 'notes' })
  notes: string;

  @Column({ nullable: true, name: 'void_reason' })
  voidReason: string;

  @Column({ nullable: true, name: 'refunded_at', type: 'timestamp' })
  refundedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => SaleItem, (item) => item.sale, { eager: true })
  items: SaleItem[];
}

