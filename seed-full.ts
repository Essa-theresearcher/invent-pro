import { DataSource } from 'typeorm';
import { User, Role } from './src/users/entities/user.entity';
import { Location } from './src/locations/entities/location.entity';
import { Product, ProductStatus } from './src/products/entities/product.entity';

async function seed() {
  const dataSource = new DataSource({
    type: 'sqlite',
    database: './data/inventory.db',
    entities: [User, Location, Product],
    synchronize: true,
  });

  await dataSource.initialize();

  const userRepo = dataSource.getRepository(User);
  const locationRepo = dataSource.getRepository(Location);
  const productRepo = dataSource.getRepository(Product);

  // 1. Create or find default location
  let location = await locationRepo.findOne({ where: { name: 'Main Store' } });
  if (!location) {
    location = locationRepo.create({
      name: 'Main Store',
      address: '123 Main Street',
      isActive: true,
    });
    await locationRepo.save(location);
    console.log('Created location: Main Store');
  }

  // 2. Create owner user
  let owner = await userRepo.findOne({ where: { email: 'admin@pos.com' } });
  if (!owner) {
    owner = userRepo.create({
      email: 'admin@pos.com',
      password: 'admin123',
      firstName: 'Admin',
      lastName: 'User',
      role: Role.OWNER,
      isActive: true,
      assignedLocationId: location.id,
    });
    await userRepo.save(owner);
    console.log('Created owner: admin@pos.com / admin123');
  }

  // 3. Create cashier user with location assignment
  let cashier = await userRepo.findOne({ where: { email: 'cashier@pos.com' } });
  if (!cashier) {
    cashier = userRepo.create({
      email: 'cashier@pos.com',
      password: 'cashier123',
      firstName: 'Cashier',
      lastName: 'User',
      role: Role.CASHIER,
      isActive: true,
      assignedLocationId: location.id,
    });
    await userRepo.save(cashier);
    console.log('Created cashier: cashier@pos.com / cashier123');
  } else {
    cashier.assignedLocationId = location.id;
    await userRepo.save(cashier);
    console.log('Updated cashier location');
  }

  // 4. Create sample products
  const sampleProducts = [
    { name: 'Bread', sku: 'BRD001', unitPrice: 3.50, barcode: '1234567890123', stock: 50, category: 'Food' },
    { name: 'Milk', sku: 'MLK001', unitPrice: 2.00, barcode: '1234567890124', stock: 50, category: 'Food' },
    { name: 'Eggs (Dozen)', sku: 'EGG001', unitPrice: 4.50, barcode: '1234567890125', stock: 50, category: 'Food' },
    { name: 'Sugar', sku: 'SGR001', unitPrice: 2.50, barcode: '1234567890126', stock: 50, category: 'Food' },
    { name: 'Rice (1kg)', sku: 'RCE001', unitPrice: 5.00, barcode: '1234567890127', stock: 50, category: 'Food' },
    { name: 'Cooking Oil', sku: 'OIL001', unitPrice: 6.00, barcode: '1234567890128', stock: 50, category: 'Food' },
    { name: 'Salt', sku: 'SLT001', unitPrice: 1.00, barcode: '1234567890129', stock: 50, category: 'Food' },
    { name: 'Tea Leaves', sku: 'TEA001', unitPrice: 4.00, barcode: '1234567890130', stock: 50, category: 'Food' },
    { name: 'Coffee', sku: 'COF001', unitPrice: 8.00, barcode: '1234567890131', stock: 50, category: 'Food' },
    { name: 'Sugar Packets', sku: 'SGR002', unitPrice: 0.50, barcode: '1234567890132', stock: 50, category: 'Food' },
    { name: 'Water (1L)', sku: 'WTR001', unitPrice: 1.50, barcode: '1234567890133', stock: 50, category: 'Drinks' },
    { name: 'Soft Drink', sku: 'DRK001', unitPrice: 2.00, barcode: '1234567890134', stock: 50, category: 'Drinks' },
  ];

  for (const p of sampleProducts) {
    let product = await productRepo.findOne({ where: { sku: p.sku } });
    if (!product) {
      product = productRepo.create({
        ...p,
        status: ProductStatus.IN_STOCK,
        minStock: 10,
        isActive: true,
      });
      await productRepo.save(product);
      console.log('Created product: ' + p.name);
    }
  }

  console.log('\nSeed completed!');
  console.log('Location ID:', location.id);

  await dataSource.destroy();
}

seed().catch(console.error);

