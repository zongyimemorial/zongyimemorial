declare module "geoip-lite" {
  export interface GeoIp {
    range?: [number, number];
    country?: string;
    region?: string;
    eu?: "0" | "1";
    timezone?: string;
    city?: string;
    ll?: [number, number];
    metro?: number;
    area?: number;
  }
  export function lookup(ip: string): GeoIp | null;
  export function pretty(ip: string): string | null;
}
