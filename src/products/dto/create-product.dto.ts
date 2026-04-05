import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsPositive, Min, IsEnum } from 'class-validator';
import { ProductBaseUnitType } from '../entities/product.entity';

export class CreateProductDto {
  @ApiProperty({ example: 'Laptop Pro 15' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'LP-001' })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiProperty({ example: 'Electronics' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ example: 1299.99 })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiProperty({ example: 45 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  stock: number;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minStock: number;

  @ApiProperty({ enum: ProductBaseUnitType, example: ProductBaseUnitType.PIECE, required: false })
  @IsEnum(ProductBaseUnitType)
  @IsOptional()
  baseUnitType?: ProductBaseUnitType;

  @ApiProperty({ example: 'piece', required: false })
  @IsString()
  @IsOptional()
  baseUnitName?: string;

  @ApiProperty({ example: 100, required: false })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  pricePerBaseUnit?: number;

  @ApiProperty({ example: 55, required: false })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  priceHalfUnit?: number;

  @ApiProperty({ example: 30, required: false })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  priceQuarterUnit?: number;

  @ApiProperty({ example: 90, required: false })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  priceThreeQuarterUnit?: number;

  @ApiProperty({ example: 120, required: false })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  retailPrice?: number;

  @ApiProperty({ example: 100, required: false })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  wholesalePrice?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  imageUrl?: string;
}
