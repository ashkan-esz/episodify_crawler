export interface CookieEntry {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number; // Unix timestamp
    secure: boolean;
    httpOnly: boolean;
}

//! This is AI generated code and may not be accurate

// A highly simplified in-memory cookie manager
export class InMemoryCookieManager {
    // Storage: Map<domain, Map<path, Map<name, CookieEntry>>>
    private cookies = new Map<string, Map<string, Map<string, CookieEntry>>>();

    // Simpler method to set a cookie from a Set-Cookie header
    async setCookie(cookieHeader: string, requestUrl: string): Promise<void> {
        const url = new URL(requestUrl);
        let domain = url.hostname;
        let path = url.pathname === '' ? '/' : url.pathname;

        const parts = cookieHeader.split(';');
        const [nameValue] = parts.shift()?.split('=') || ['', ''];
        const name = nameValue.trim();
        const value = parts.shift()?.trim(); // This is a simplification; value could be multi-part

        if (!name) {
            return;
        }

        let expires: number | undefined;
        let secure = false;
        let httpOnly = false;

        for (const part of parts) {
            const [key, val] = part.trim().split('=');
            switch (key.toLowerCase()) {
                case 'domain':
                    // Simplify: take the domain from header, but ensure it's valid for current request
                    // In a real tough-cookie, this is complex (superdomains, etc.)
                    domain = val?.trim() || domain;
                    break;
                case 'path':
                    path = val?.trim() || path;
                    break;
                case 'expires':
                    try {
                        expires = new Date(val?.trim() || '').getTime();
                    } catch {
                        // ignore invalid date
                    }
                    break;
                case 'max-age': {
                    const maxAge = Number.parseInt(val?.trim() || '0');
                    if (!Number.isNaN(maxAge)) {
                        expires = Date.now() + maxAge * 1000;
                    }
                    break;
                }
                case 'secure':
                    secure = true;
                    break;
                case 'httponly':
                    httpOnly = true;
                    break;
            }
        }

        // Basic domain validation - ensure cookie is for current or superdomain
        // This is still a simplification compared to tough-cookie's strict rules
        if (!domain.startsWith('.')) {
            domain = '.' + domain; // Standardize for matching
        }
        if (!url.hostname.endsWith(domain)) {
            // If the domain specified in Set-Cookie doesn't match a superdomain,
            // tough-cookie would usually reject it or clamp it. Here, we'll try to use the request host.
            domain = '.' + url.hostname;
        }

        const cookieEntry: CookieEntry = {
            name,
            value: value || '',
            domain,
            path,
            expires,
            secure,
            httpOnly,
        };

        if (cookieEntry.expires && cookieEntry.expires <= Date.now()) {
            // Don't store expired cookies
            return;
        }

        if (!this.cookies.has(domain)) {
            this.cookies.set(domain, new Map());
        }
        const domainMap = this.cookies.get(domain)!;

        if (!domainMap.has(path)) {
            domainMap.set(path, new Map());
        }
        const pathMap = domainMap.get(path)!;

        pathMap.set(name, cookieEntry);
    }

    // Simpler method to get cookie string for a request
    async getCookieString(requestUrl: string): Promise<string> {
        const url = new URL(requestUrl);
        const requestHost = url.hostname;
        const requestPath = url.pathname;
        const isSecureRequest = url.protocol === 'https:';

        const relevantCookies: string[] = [];

        for (const [domain, domainMap] of this.cookies.entries()) {
            // Check domain matching
            if (requestHost === domain || requestHost.endsWith(domain)) {
                for (const [path, pathMap] of domainMap.entries()) {
                    // Check path matching
                    if (requestPath.startsWith(path)) {
                        for (const [name, cookie] of pathMap.entries()) {
                            // Check expiry
                            if (cookie.expires && cookie.expires <= Date.now()) {
                                pathMap.delete(name); // Remove expired cookie
                                continue;
                            }
                            // Check secure flag
                            if (cookie.secure && !isSecureRequest) {
                                continue;
                            }
                            // HttpOnly cookies are usually not accessible by client-side JS,
                            // but for a crawler, we always send them if other conditions match.
                            relevantCookies.push(`${cookie.name}=${cookie.value}`);
                        }
                    }
                }
            }
        }

        return relevantCookies.join('; ');
    }
}

