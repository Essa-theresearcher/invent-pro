import { INestApplication, Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import bcrypt from 'bcrypt';
import { User, Role } from './users/entities/user.entity';

type UserSeedPayload = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: Role;
  isActive: boolean;
  phone: string | null;
  assignedLocationId: string | null;
};

export async function seedAdminUser(app: INestApplication): Promise<void> {
  const logger = new Logger('Seed');

  const userRepository = app.get<Repository<User>>(getRepositoryToken(User));
  const adminEmail = 'admin@admin.com';
  const hashedPassword = await bcrypt.hash('Admin@1234', 10);

  const existingAdmin = await userRepository.findOne({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    await userRepository.update(
      { email: adminEmail },
      { password: hashedPassword },
    );
    logger.log('Admin user password force-updated successfully');
    return;
  }

  const adminUserData: UserSeedPayload = {
    firstName: 'Admin',
    lastName: 'User',
    email: adminEmail,
    password: hashedPassword,
    role: Role.OWNER,
    isActive: true,
    phone: null,
    assignedLocationId: null,
  };

  await userRepository.save(adminUserData as unknown as User);
  logger.log('Admin user seeded successfully');
}
