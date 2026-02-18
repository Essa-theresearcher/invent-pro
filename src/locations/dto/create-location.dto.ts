import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({ example: 'Main Store' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Main branch location', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '123 Main Street, City', required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ example: '+1 555-0000', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

