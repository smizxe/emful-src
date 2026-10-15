/**
 * One account can hold several roles -- a staff member who also designs, for
 * instance. `role` stays the primary one (where they land after login, what the
 * session cookie carries); `roles` lists everything they hold.
 *
 * Everything that asks "may this user do X" goes through here, so a second role
 * is never silently ignored.
 */

export const ROLE_COOKIE = 'userRole';
export const ROLES_COOKIE = 'userRoles';

type RoleBearer = { role?: string | null; roles?: string[] | null };

/** Every role an account holds, primary first, de-duplicated. */
export function getUserRoles(user: RoleBearer | null | undefined): string[] {
    if (!user) return [];
    const all = [user.role, ...(user.roles || [])]
        .map((r) => String(r || '').trim().toUpperCase())
        .filter(Boolean);
    return Array.from(new Set(all));
}

export function hasRole(user: RoleBearer | null | undefined, role: string): boolean {
    return getUserRoles(user).includes(role.toUpperCase());
}

export function hasAnyRole(user: RoleBearer | null | undefined, roles: readonly string[]): boolean {
    const held = getUserRoles(user);
    return roles.some((role) => held.includes(String(role).toUpperCase()));
}

/** What the session cookie carries, so middleware can check without a DB round trip. */
export function serializeRoles(user: RoleBearer): string {
    return getUserRoles(user).join(',');
}

export function parseRolesCookie(value: string | undefined | null, fallbackRole?: string | null): string[] {
    const fromCookie = String(value || '')
        .split(',')
        .map((r) => r.trim().toUpperCase())
        .filter(Boolean);

    if (fromCookie.length > 0) return fromCookie;

    // Sessions created before multi-role shipped only have the single-role cookie.
    const fallback = String(fallbackRole || '').trim().toUpperCase();
    return fallback ? [fallback] : [];
}

export function cookieHasAnyRole(
    rolesCookie: string | undefined | null,
    fallbackRole: string | undefined | null,
    allowed: readonly string[]
): boolean {
    const held = parseRolesCookie(rolesCookie, fallbackRole);
    return allowed.some((role) => held.includes(String(role).toUpperCase()));
}
