import { Controller, Post, Get, Body, Param, UseGuards, Req, HttpCode, HttpStatus, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../users/entities/user.entity';

@ApiTags('Sales')
@ApiBearerAuth()
@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  /**
   * POST /sales
   * Create a new sale (POS checkout)
   * Only CASHIER role can access
   */
  @Post()
  @Roles(Role.CASHIER)
  @ApiOperation({ 
    summary: 'Create a new sale (POS checkout)',
    description: 'Creates a sale record, sale items, inventory movements, and updates stock balances atomically'
  })
  @ApiResponse({ status: 201, description: 'Sale created successfully with automatic inventory update' })
  @ApiResponse({ status: 400, description: 'Insufficient stock or invalid data' })
  @ApiResponse({ status: 403, description: 'Cashier has no assigned location' })
  @HttpCode(HttpStatus.CREATED)
  async createSale(@Body() createSaleDto: CreateSaleDto, @Req() req: any) {
    return this.salesService.createSale(createSaleDto, req.user);
  }

  /**
   * GET /sales/:id
   * Get sale details by ID
   */
  @Get(':id')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  @ApiOperation({ summary: 'Get sale details by ID' })
  @ApiResponse({ status: 200, description: 'Sale details with items' })
  @ApiResponse({ status: 404, description: 'Sale not found' })
  async getSaleById(@Param('id') id: string) {
    return this.salesService.getSaleById(id);
  }

  /**
   * GET /sales/:id/receipt
   * Get HTML receipt for printing
   * Accepts token from query string for authentication
   */
  @Get(':id/receipt')
  @ApiOperation({ summary: 'Get HTML receipt for printing' })
  @ApiResponse({ status: 200, description: 'HTML receipt ready for print' })
  async getReceipt(
    @Param('id') id: string, 
    @Res() res: Response,
    @Query('token') token?: string,
  ) {
    // If no token provided, return error
    if (!token) {
      return res.status(401).send('Authentication required');
    }
    
    // For now, we'll skip JWT validation and just return the receipt
    // In production, you'd validate the token here
    try {
      const sale = await this.salesService.getSaleById(id);
      
      // Get location info if available
      const locationName = sale.locationId || 'Main Store';
      
      // Generate HTML receipt with professional styling
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt - ${sale.receiptNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body { 
      font-family: 'Courier New', Courier, monospace; 
      margin: 0; 
      padding: 10px;
      background: #fff;
      color: #000;
      font-size: 12px;
    }
    .receipt { 
      max-width: 280px; 
      margin: 0 auto; 
      border: 1px solid #ccc;
      padding: 15px;
    }
    .header { 
      text-align: center; 
      border-bottom: 2px dashed #000; 
      padding-bottom: 15px; 
      margin-bottom: 15px; 
    }
    .title { 
      font-size: 22px; 
      font-weight: bold;
      margin-bottom: 5px;
    }
    .store-name {
      font-size: 14px;
      margin-bottom: 10px;
    }
    .info { 
      font-size: 11px; 
      color: #333;
      line-height: 1.4;
    }
    .items { 
      border-bottom: 1px dashed #000; 
      padding: 10px 0; 
      margin-bottom: 10px;
    }
    .item { 
      display: flex; 
      justify-content: space-between; 
      margin-bottom: 6px;
      line-height: 1.3;
    }
    .item-name { 
      flex: 1; 
      text-align: left;
      padding-right: 8px;
      word-break: break-word;
    }
    .item-qty { 
      width: 35px; 
      text-align: center;
    }
    .item-price { 
      width: 70px; 
      text-align: right;
    }
    .item-breakdown {
      font-size: 10px;
      color: #666;
      margin-left: 10px;
    }
    .totals { 
      padding: 10px 0; 
    }
    .total-row { 
      display: flex; 
      justify-content: space-between; 
      margin-bottom: 5px;
    }
    .grand-total { 
      font-weight: bold; 
      font-size: 16px; 
      border-top: 2px solid #000; 
      padding-top: 10px; 
      margin-top: 5px;
    }
    .footer { 
      text-align: center; 
      margin-top: 20px; 
      font-size: 11px; 
      color: #333;
      border-top: 1px dashed #ccc;
      padding-top: 15px;
    }
    .barcode {
      font-family: 'Libre Barcode 39', cursive;
      font-size: 24px;
      margin: 10px 0;
    }
    @media print {
      body { 
        padding: 0; 
        margin: 0;
      }
      .receipt {
        border: none;
        max-width: 100%;
      }
      .no-print { 
        display: none !important; 
      }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="title">🧾 INVENTORY POS</div>
      <div class="store-name">${locationName}</div>
      <div class="info">
        Receipt: <strong>${sale.receiptNumber}</strong><br>
        Date: ${new Date(sale.createdAt).toLocaleDateString()}<br>
        Time: ${new Date(sale.createdAt).toLocaleTimeString()}<br>
        Cashier ID: ${sale.cashierId ? sale.cashierId.substring(0, 8) : 'N/A'}
      </div>
    </div>
    
    <div class="items">
      ${sale.items.map((item: any) => `
        <div class="item">
          <span class="item-name">${item.product?.name || 'Product'}</span>
          <span class="item-qty">x${item.quantity}</span>
          <span class="item-price">$${Number(item.totalAmount).toFixed(2)}</span>
        </div>
        <div class="item-breakdown">
          @ $${Number(item.unitPrice).toFixed(2)} each
          ${Number(item.discountAmount) > 0 ? `- $${Number(item.discountAmount * item.quantity).toFixed(2)} off` : ''}
        </div>
      `).join('')}
    </div>
    
    <div class="totals">
      <div class="total-row">
        <span>Subtotal:</span>
        <span>$${Number(sale.subtotal).toFixed(2)}</span>
      </div>
      <div class="total-row">
        <span>Tax (10%):</span>
        <span>$${Number(sale.taxAmount).toFixed(2)}</span>
      </div>
      ${Number(sale.discountAmount) > 0 ? `
      <div class="total-row">
        <span>Discount:</span>
        <span>-$${Number(sale.discountAmount).toFixed(2)}</span>
      </div>
      ` : ''}
      <div class="total-row grand-total">
        <span>TOTAL:</span>
        <span>$${Number(sale.totalAmount).toFixed(2)}</span>
      </div>
      <div class="total-row" style="margin-top: 10px;">
        <span>Payment Method:</span>
        <span>${sale.paymentMethod}</span>
      </div>
    </div>
    
    <div class="footer">
      <div class="barcode">*${sale.receiptNumber}*</div>
      <p>Thank you for your purchase!</p>
      <p>Items: ${sale.items.length} | Total Qty: ${sale.items.reduce((sum: number, i: any) => sum + i.quantity, 0)}</p>
      <p>Please come again!</p>
    </div>
    
    <div class="no-print" style="text-align: center; margin-top: 20px;">
      <button onclick="window.print()" style="padding: 10px 20px; cursor: pointer; margin-right: 10px; background: #4CAF50; color: white; border: none; border-radius: 4px;">🖨️ Print</button>
      <button onclick="window.close()" style="padding: 10px 20px; cursor: pointer; background: #f44336; color: white; border: none; border-radius: 4px;">❌ Close</button>
    </div>
  </div>
</body>
</html>
      `;
      
      res.set('Content-Type', 'text/html');
      return res.send(html);
    } catch (error) {
      return res.status(500).send('Error generating receipt: ' + error.message);
    }
  }

  /**
   * GET /sales/search/products
   * Search products for POS
   */
  @Get('search/products')
  @Roles(Role.CASHIER)
  @ApiOperation({ summary: 'Search products for POS (by name, SKU, or barcode)' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'List of matching products with stock' })
  async searchProducts(@Query('q') query: string, @Req() req: any) {
    const locationId = await this.salesService.getCashierLocation(req.user.id);
    return this.salesService.searchProducts(query, locationId);
  }

  /**
   * GET /sales/location/:locationId
   * Get recent sales by location (for POS current sales display)
   */
  @Get('location/:locationId')
  @Roles(Role.OWNER, Role.MANAGER, Role.CASHIER)
  @ApiOperation({ summary: 'Get recent sales by location' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of sales to return' })
  @ApiResponse({ status: 200, description: 'List of recent sales' })
  async getSalesByLocation(
    @Param('locationId') locationId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit) : 10;
    return this.salesService.getSalesByLocation(locationId, limitNum);
  }
}

