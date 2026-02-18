import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
  ) {}

  /**
   * Find all categories
   */
  async findAll(orgId?: string): Promise<Category[]> {
    const query = this.categoriesRepository.createQueryBuilder('category');
    
    // If orgId is provided, filter by it; otherwise return all categories
    if (orgId && orgId !== 'default-org') {
      query.where('category.orgId = :orgId', { orgId });
    }
    
    query.orderBy('category.name', 'ASC');
    return query.getMany();
  }

  /**
   * Find category by ID
   */
  async findOne(id: string): Promise<Category> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  /**
   * Create a new category
   */
  async create(createCategoryDto: CreateCategoryDto, orgId: string): Promise<Category> {
    // Check if category with same name already exists for this org
    const existing = await this.categoriesRepository.findOne({
      where: { name: createCategoryDto.name, orgId }
    });
    
    if (existing) {
      throw new ConflictException(`Category "${createCategoryDto.name}" already exists`);
    }
    
    const category = new Category();
    category.name = createCategoryDto.name;
    category.description = createCategoryDto.description || '';
    category.isActive = true;
    category.orgId = orgId;
    
    return this.categoriesRepository.save(category);
  }

  /**
   * Update category
   */
  async update(id: string, updateData: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);
    
    // Check for duplicate name if name is being changed
    if (updateData.name && updateData.name !== category.name) {
      const existing = await this.categoriesRepository.findOne({
        where: { name: updateData.name, orgId: category.orgId }
      });
      
      if (existing) {
        throw new ConflictException(`Category "${updateData.name}" already exists`);
      }
    }
    
    Object.assign(category, updateData);
    return this.categoriesRepository.save(category);
  }

  /**
   * Delete category
   */
  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    await this.categoriesRepository.remove(category);
  }
}

