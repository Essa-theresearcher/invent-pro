import { IsArray, IsNotEmpty, IsString, IsNumber, Min, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaleItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ description: 'Quantity to purchase', example: 2 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ description: 'Unit discount amount' })
  @IsNumber()
  @IsOptional()
  discountAmount?: number;
}

export class CreateSaleDto {
  @ApiProperty({ 
    description: 'Items in the cart', 
    type: [SaleItemDto],
    example: [
      { productId: 'uuid-1', quantity: 2 },
      { productId: 'uuid-2', quantity: 1 }
    ]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @ApiProperty({ 
    description: 'Payment method', 
    enum: ['CASH', 'CARD', 'MOBILE_MONEY', 'OTHER']
  })
  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @ApiPropertyOptional({ description: 'Discount percentage (0-100)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Customer ID (optional)' })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

