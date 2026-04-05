import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../users/entities/user.entity';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users/me
   * Get current authenticated user info (no role restriction)
   * This endpoint is called by frontend after login
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user info' })
  @ApiResponse({ status: 200, description: 'Current user with role and location' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentUser(@Request() req: any) {
    return this.usersService.getCurrentUser(req.user.id);
  }

  /**
   * GET /users
   * Get all users with optional filtering
   */
  @Get()
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Get all users with optional filtering by role and status' })
  @ApiQuery({ name: 'role', required: false, enum: Role })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'List of users' })
  async findAll(
    @Request() req: any,
    @Query('role') role?: Role,
    @Query('isActive') isActive?: string,
  ) {
    const active = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.usersService.findAll(
      { role, isActive: active as boolean | undefined },
      req.user,
    );
  }

  /**
   * GET /users/:id
   * Get user by ID
   */
  @Get(':id')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  /**
   * POST /users
   * Create a new user
   */
  @Post()
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Email already exists or invalid data' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  /**
   * PUT /users/:id
   * Update user
   */
  @Put(':id')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Update user details' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  /**
   * PUT /users/:id/activate
   * Activate user
   */
  @Put(':id/activate')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Activate user' })
  @ApiResponse({ status: 200, description: 'User activated successfully' })
  async activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.activate(id);
  }

  /**
   * PUT /users/:id/deactivate
   * Deactivate user
   */
  @Put(':id/deactivate')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Deactivate user' })
  @ApiResponse({ status: 200, description: 'User deactivated successfully' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.deactivate(id);
  }

  /**
   * DELETE /users/:id
   * Delete user
   */
  @Delete(':id')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Delete user' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }

  /**
   * PUT /users/:id/location
   * Assign location to user
   */
  @Put(':id/location')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Assign location to user' })
  @ApiResponse({ status: 200, description: 'Location assigned successfully' })
  async assignLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { locationId: string },
  ) {
    await this.usersService.assignLocation(id, body.locationId);
    return { success: true, message: 'Location assigned successfully' };
  }

  /**
   * GET /users/:id/location
   * Get user's assigned location
   */
  @Get(':id/location')
  @Roles(Role.OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Get user assigned location' })
  @ApiResponse({ status: 200, description: 'User location' })
  async getUserLocation(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUserLocation(id);
  }
}

