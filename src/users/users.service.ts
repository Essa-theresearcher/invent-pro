import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, Role } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserLocation } from '../sales/entities/user-location.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(UserLocation)
    private userLocationRepository: Repository<UserLocation>,
  ) {}

  /**
   * Get current user with assigned location
   * Used by /users/me endpoint
   */
  async getCurrentUser(id: string): Promise<any> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Format response - exclude password
    const { password, ...userData } = user;

    return {
      id: userData.id,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      phone: userData.phone,
      role: userData.role,
      isActive: userData.isActive,
      assigned_location_id: userData.assignedLocationId,
      createdAt: userData.createdAt,
    };
  }

  /**
   * Find all users with optional filtering
   */
  async findAll(filters?: { role?: Role; isActive?: boolean }): Promise<User[]> {
    const query = this.usersRepository.createQueryBuilder('user');

    if (filters?.role) {
      query.andWhere('user.role = :role', { role: filters.role });
    }

    if (filters?.isActive !== undefined) {
      query.andWhere('user.isActive = :isActive', { isActive: filters.isActive });
    }

    query.orderBy('user.createdAt', 'DESC');

    return query.getMany();
  }

  /**
   * Find user by ID
   */
  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  /**
   * Create a new user
   */
  async create(createUserDto: CreateUserDto): Promise<User> {
    // Check if email already exists
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Validate role
    if (!Object.values(Role).includes(createUserDto.role)) {
      throw new BadRequestException('Invalid role');
    }

    const user = this.usersRepository.create({
      ...createUserDto,
      isActive: true,
    });

    return this.usersRepository.save(user);
  }

  /**
   * Update user
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // Check email conflict if changing email
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.findByEmail(updateUserDto.email);
      if (existingUser) {
        throw new ConflictException('Email already exists');
      }
    }

    // Validate role if changing
    if (updateUserDto.role && !Object.values(Role).includes(updateUserDto.role)) {
      throw new BadRequestException('Invalid role');
    }

    Object.assign(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  /**
   * Activate user
   */
  async activate(id: string): Promise<User> {
    const user = await this.findOne(id);
    user.isActive = true;
    return this.usersRepository.save(user);
  }

  /**
   * Deactivate user
   */
  async deactivate(id: string): Promise<User> {
    const user = await this.findOne(id);
    user.isActive = false;
    return this.usersRepository.save(user);
  }

  /**
   * Delete user
   */
  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
  }

  /**
   * Assign location to user
   */
  async assignLocation(userId: string, locationId: string): Promise<void> {
    // Check if user exists
    const user = await this.findOne(userId);

    // Update user's assignedLocationId directly
    user.assignedLocationId = locationId;
    await this.usersRepository.save(user);

    // Also update the UserLocation table for relationship tracking
    await this.userLocationRepository.delete({ userId });
    const userLocation = this.userLocationRepository.create({
      userId,
      locationId,
    });
    await this.userLocationRepository.save(userLocation);
  }

  /**
   * Get user's assigned location
   */
  async getUserLocation(userId: string): Promise<UserLocation | null> {
    return this.userLocationRepository.findOne({ where: { userId } });
  }
}

