import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum StockRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('stock_requests')
export class StockRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ name: 'from_location_id' })
  fromLocationId: string;

  @Column({ name: 'to_location_id' })
  toLocationId: string;

  @Column({ type: 'decimal', precision: 12, scale: 3 })
  quantity: number;

  @Column({ nullable: true })
  note?: string;

  @Column({
    type: 'simple-enum',
    enum: StockRequestStatus,
    default: StockRequestStatus.PENDING,
  })
  status: StockRequestStatus;

  @Column({ name: 'requested_by' })
  requestedBy: string;

  @Column({ nullable: true, name: 'approved_by' })
  approvedBy?: string;

  @Column({ nullable: true, name: 'approved_at' })
  approvedAt?: Date;

  @Column({ nullable: true, name: 'rejected_reason' })
  rejectedReason?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
