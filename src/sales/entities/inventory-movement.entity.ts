import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum MovementType {
  PURCHASE_IN = 'PURCHASE_IN',
  SALE_OUT = 'SALE_OUT',
  TRANSFER_OUT = 'TRANSFER_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
  ADJUSTMENT_IN = 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT = 'ADJUSTMENT_OUT',
  RETURN_IN = 'RETURN_IN',
}

@Entity('inventory_movements')
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ name: 'location_id' })
  locationId: string;

  @Column({
    type: 'simple-enum',
    enum: MovementType,
  })
  type: MovementType;

  @Column()
  quantity: number;

  @Column({ nullable: true, name: 'reference_id' })
  referenceId: string;

  @Column({ nullable: true, name: 'reference_type' })
  referenceType: string;

  @Column({ nullable: true })
  reason: string;

  @Column({ name: 'previous_qty' })
  previousQty: number;

  @Column({ name: 'new_qty' })
  newQty: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'unit_cost' })
  unitCost: number;

  @Column({ nullable: true, name: 'document_url' })
  documentUrl: string;

  @Column({ name: 'created_by' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

