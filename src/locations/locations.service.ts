import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from './entities/location.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location)
    private locationsRepository: Repository<Location>,
  ) {}

  /**
   * Find all locations
   */
  async findAll(): Promise<Location[]> {
    return this.locationsRepository.find({
      order: { name: 'ASC' },
    });
  }

  /**
   * Find active locations only
   */
  async findActive(): Promise<Location[]> {
    return this.locationsRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  /**
   * Find location by ID
   */
  async findOne(id: string): Promise<Location> {
    const location = await this.locationsRepository.findOne({ where: { id } });
    if (!location) {
      throw new NotFoundException(`Location with ID ${id} not found`);
    }
    return location;
  }

  /**
   * Create a new location
   */
  async create(createLocationDto: CreateLocationDto): Promise<Location> {
    // Check if location with same name already exists
    const existing = await this.locationsRepository.findOne({
      where: { name: createLocationDto.name },
    });
    
    if (existing) {
      throw new ConflictException(`Location "${createLocationDto.name}" already exists`);
    }
    
    const location = this.locationsRepository.create(createLocationDto);
    return this.locationsRepository.save(location);
  }

  /**
   * Update location
   */
  async update(id: string, updateData: UpdateLocationDto): Promise<Location> {
    const location = await this.findOne(id);
    
    // Check for duplicate name if name is being changed
    if (updateData.name && updateData.name !== location.name) {
      const existing = await this.locationsRepository.findOne({
        where: { name: updateData.name },
      });
      
      if (existing) {
        throw new ConflictException(`Location "${updateData.name}" already exists`);
      }
    }
    
    Object.assign(location, updateData);
    return this.locationsRepository.save(location);
  }

  /**
   * Delete location
   */
  async remove(id: string): Promise<void> {
    const location = await this.findOne(id);
    await this.locationsRepository.remove(location);
  }

  /**
   * Assign location to user
   */
  async assignToUser(userId: string, locationId: string, userLocationRepo: any): Promise<void> {
    // Check if location exists
    await this.findOne(locationId);
    
    // Remove any existing assignment
    await userLocationRepo.delete({ userId });
    
    // Create new assignment
    await userLocationRepo.save({
      userId,
      locationId,
    });
  }

  /**
   * Get or create a default location
   * Used when initializing products or users without explicit location
   */
  async getOrCreateDefault(): Promise<Location> {
    // Try to find existing default location
    let location = await this.locationsRepository.findOne({
      where: { name: 'Main Store' },
    });

    if (!location) {
      // Create default location
      location = this.locationsRepository.create({
        name: 'Main Store',
        address: 'Default location',
        isActive: true,
      });
      await this.locationsRepository.save(location);
    }

    return location;
  }
}

