import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor() {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // First try the default Passport JWT validation
      const isValid = await super.canActivate(context);
      
      if (!isValid) {
        throw new UnauthorizedException('Invalid or missing authentication');
      }
      
      const request = context.switchToHttp().getRequest();
      const user = request.user;
      
      if (!user) {
        throw new UnauthorizedException('Invalid or missing authentication');
      }
      
      return true;
    } catch (error) {
      // Handle specific error types to return proper 401 instead of 500
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // For any other errors (including JWT validation errors), return 401
      throw new UnauthorizedException('Authentication required');
    }
  }
}

