import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { Role } from '../entities/user.entity';

export class UpdateUserDto {
  @ApiProperty({ example: 'john@company.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'newpassword123', minLength: 6, required: false })
  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

  @ApiProperty({ example: 'John', required: false })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ example: 'Doe', required: false })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ example: '+1 555-0100', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ enum: Role, example: Role.MANAGER, required: false })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ example: 'uuid-of-location', required: false, description: 'Assigned location ID' })
  @IsString()
  @IsOptional()
  assignedLocationId?: string;
}

