import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';

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
  @IsNumber()
  @Min(0)
  stock: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0)
  minStock: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  imageUrl?: string;
}
