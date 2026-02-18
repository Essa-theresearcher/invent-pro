import { DataSource } from 'typeorm';
import { User, Role } from './src/users/entities/user.entity';
import { Location } from './src/locations/entities/location.entity';

async function seed() {
  const dataSource = new DataSource({
    type: 'sqlite',
    database: './data/inventory.db',
    entities: [User, Location],
    synchronize: true,
  });

  await dataSource.initialize();

  const userRepository = dataSource.getRepository(User);
  const locationRepository = dataSource.getRepository(Location);
  
  // Get or create default location
  let location = await locationRepository.findOne({ where: { name: 'Main Store' } });
  if (!location) {
    location = locationRepository.create({
      name: 'Main Store',
      address: '123 Main Street',
      isActive: true,
    });
    await locationRepository.save(location);
    console.log('Created location: Main Store');
  }
  
  // Create owner/admin user
  const existingOwner = await userRepository.findOne({
    where: { email: 'admin@pos.com' },
  });

  if (existingOwner) {
    console.log('Admin user already exists:', existingOwner.email);
  } else {
    const owner = userRepository.create({
      email: 'admin@pos.com',
      password: 'admin123',
      firstName: 'Admin',
      lastName: 'User',
      role: Role.OWNER,
      isActive: true,
      assignedLocationId: location.id,
    });

    await userRepository.save(owner);
    console.log('Admin user created successfully!');
    console.log('Email: admin@pos.com');
    console.log('Password: admin123');
    console.log('Role: OWNER');
  }
  
  // Create cashier user with location assignment
  const existingCashier = await userRepository.findOne({
    where: { email: 'cashier@pos.com' },
  });

  if (existingCashier) {
    // Update location if not set
    if (!existingCashier.assignedLocationId) {
      existingCashier.assignedLocationId = location.id;
      await userRepository.save(existingCashier);
      console.log('Cashier location updated!');
    }
    console.log('Cashier user already exists:', existingCashier.email);
  } else {
    const cashier = userRepository.create({
      email: 'cashier@pos.com',
      password: 'cashier123',
      firstName: 'Cashier',
      lastName: 'User',
      role: Role.CASHIER,
      isActive: true,
      assignedLocationId: location.id,
    });

    await userRepository.save(cashier);
    console.log('Cashier user created successfully!');
    console.log('Email: cashier@pos.com');
    console.log('Password: cashier123');
    console.log('Role: CASHIER');
    console.log('Location ID:', location.id);
  }

  await dataSource.destroy();
}

seed().catch(console.error);

