import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../users/entities/user.entity';
import { LocationsService } from '../locations/locations.service';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly locationsService: LocationsService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all products with optional filtering' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'lowStock', required: false })
  @ApiQuery({ name: 'outOfStock', required: false })
  @ApiResponse({ status: 200, description: 'List of products' })
  async findAll(
    @Request() req: any,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('lowStock') lowStock?: string,
    @Query('outOfStock') outOfStock?: string,
  ) {
    return this.productsService.findAll({
      search,
      category,
      lowStock: lowStock === 'true',
      outOfStock: outOfStock === 'true',
      actor: req.user,
    });
  }

  /**
   * GET /products/location/:locationId
   * Get all products with stock at a specific location
   * Used by POS to show available products
   */
  @Get('location/:locationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get products with stock at a location' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiResponse({ status: 200, description: 'List of products at location' })
  async findAllByLocation(
    @Param('locationId') locationId: string,
    @Request() req: any,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    const actorRole = req.user?.role;
    const actorLocationId = req.user?.assignedLocationId ?? req.user?.assigned_location_id ?? null;

    if (actorRole !== Role.OWNER && actorLocationId && String(actorLocationId) !== String(locationId)) {
      throw new ForbiddenException('Cannot access products for another location');
    }

    return this.productsService.findAllByLocation(locationId, { search, category });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product details' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  async create(@Body() createProductDto: CreateProductDto, @Request() req: any) {
    const product = await this.productsService.create(createProductDto, {
      id: req.user?.id,
      role: req.user?.role,
      assignedLocationId: req.user?.assignedLocationId ?? req.user?.assigned_location_id ?? null,
    });
    
    // Get default location and initialize stock
    const defaultLocation = await this.locationsService.getOrCreateDefault();
    await this.productsService.initializeStockAtLocation(
      product.id, 
      String(defaultLocation.id), 
      createProductDto.stock
    );
    
    return product;
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  async update(@Param('id') id: string, @Body() updateData: Partial<CreateProductDto>) {
    return this.productsService.update(id, updateData);
  }

  @Put(':id/stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Adjust product stock' })
  @ApiResponse({ status: 200, description: 'Stock adjusted successfully' })
  async adjustStock(
    @Param('id') id: string,
    @Body() body: { type: 'add' | 'remove' | 'set'; quantity: number },
  ) {
    return this.productsService.adjustStock(id, body);
  }

  /**
   * POST /products/reconcile/single-location
   * Reconcile global product.stock from default location stock balances (Main Store)
   */
  @Post('reconcile/single-location')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reconcile global stock from default single location' })
  @ApiResponse({ status: 200, description: 'Stock reconciliation completed successfully' })
  async reconcileSingleLocationStock() {
    return this.productsService.reconcileGlobalStockFromDefaultLocation();
  }

  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft deactivate product (safe delete)' })
  @ApiResponse({ status: 200, description: 'Product deactivated successfully' })
  async deactivate(@Param('id') id: string) {
    return this.productsService.deactivate(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product (hard delete)' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  async remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
