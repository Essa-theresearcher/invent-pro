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
  const usersCount = await userRepository.count();

  if (usersCount > 0) {
    logger.log('Admin user already exists, skipping seed');
    return;
  }

  const hashedPassword = await bcrypt.hash('Admin@1234', 10);

  const adminUserData: UserSeedPayload = {
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@admin.com',
    password: hashedPassword,
    role: Role.OWNER,
    isActive: true,
    phone: null,
    assignedLocationId: null,
  };

  await userRepository.save(adminUserData as unknown as User);
  logger.log('Admin user seeded successfully');
}
