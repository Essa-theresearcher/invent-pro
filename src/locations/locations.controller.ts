import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  async findAll() {
    return this.locationsService.findAll();
  }

  @Get('active')
  async findActive() {
    return this.locationsService.findActive();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.locationsService.findOne(id);
  }

  @Post()
  async create(@Body() createLocationDto: CreateLocationDto) {
    return this.locationsService.create(createLocationDto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateLocationDto: UpdateLocationDto,
  ) {
    return this.locationsService.update(id, updateLocationDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.locationsService.remove(id);
  }
}

