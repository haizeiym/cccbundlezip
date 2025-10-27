declare module "fflate" {
    export function inflateSync(data: Uint8Array, options?: any): Uint8Array;
    export function deflateSync(data: Uint8Array, options?: any): Uint8Array;
    export function inflate(data: Uint8Array, options?: any, callback?: (err: Error | null, data?: Uint8Array) => void): void;
    export function deflate(data: Uint8Array, options?: any, callback?: (err: Error | null, data?: Uint8Array) => void): void;
    export function gzipSync(data: Uint8Array, options?: any): Uint8Array;
    export function gunzipSync(data: Uint8Array, options?: any): Uint8Array;
    export function zlibSync(data: Uint8Array, options?: any): Uint8Array;
    export function unzlibSync(data: Uint8Array, options?: any): Uint8Array;
    export function zipSync(files: Record<string, Uint8Array>, options?: any): Uint8Array;
    export function unzipSync(data: Uint8Array, options?: any): Record<string, Uint8Array>;
}
