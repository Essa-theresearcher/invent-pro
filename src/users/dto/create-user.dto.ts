import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength, IsEnum, IsOptional, IsNumberString } from 'class-validator';
import { Role } from '../entities/user.entity';

export class CreateUserDto {
  @ApiProperty({ example: 'john@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '+1 555-0100', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ enum: Role, example: Role.CASHIER })
  @IsEnum(Role)
  @IsNotEmpty()
  role: Role;

  @ApiProperty({ example: 'uuid-of-location', required: false, description: 'Assigned location ID for CASHIER role' })
  @IsString()
  @IsOptional()
  assignedLocationId?: string;
}

