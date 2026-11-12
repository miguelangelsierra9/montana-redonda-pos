import { SetMetadata, createParamDecorator, ExecutionContext, Injectable, CanActivate, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { RoleCode } from '@mrp/shared';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export interface AuthUserPayload {
  id: string;
  username: string;
  email: string;
  roleCode: RoleCode;
  employeeId?: string;
  employeeName?: string;
  assignedActivityId?: string | null;
  permissions: string[];
}

export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext): AuthUserPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const { user } = context.switchToHttp().getRequest<{ user: AuthUserPayload }>();
    if (!user) {
      return false;
    }

    // ADMINISTRADOR tiene acceso completo a todo el sistema
    if (user.roleCode === RoleCode.ADMIN) {
      return true;
    }

    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(user.roleCode)) {
        throw new ForbiddenException(
          `Acceso denegado: Su rol (${user.roleCode}) no tiene autorización para esta operación. Se requiere: ${requiredRoles.join(', ')}`
        );
      }
    }

    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAll = requiredPermissions.every((p) => user.permissions?.includes(p));
      if (!hasAll) {
        throw new ForbiddenException(
          `Acceso denegado: No posee el permiso requerido (${requiredPermissions.join(', ')}).`
        );
      }
    }

    return true;
  }
}

