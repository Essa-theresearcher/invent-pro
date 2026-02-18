import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor() {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First try the default Passport JWT validation
    const isValid = await super.canActivate(context);
    
    if (!isValid) {
      return false;
    }
    
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      throw new UnauthorizedException('Invalid or missing authentication');
    }
    
    return true;
  }
}

