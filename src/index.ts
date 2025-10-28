// 声明 cc 命名空间
declare const cc: {
    assetManager?: {
        downloader: {
            register: (extension: string, handler: Function) => void;
        };
    };
};

import * as fflate from "./fflate.js";

// ============================== 常量定义 ==============================

// ZIP 文件结构相关常量
const ZIP_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_COMPRESSION_DEFLATE = 8;
const ZIP_COMPRESSION_STORE = 0;

// 图片大小阈值：2MB（超过此大小使用 Blob 方式加载）
const IMAGE_SIZE_THRESHOLD = 2 * 1024 * 1024;

// 纹理压缩格式（不能直接用 Image 加载）
const TEXTURE_FORMATS = [".astc", ".pvr", ".ktx", ".dds"];

// 支持的图片格式
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ...TEXTURE_FORMATS];

// 缓存配置
const CACHE_CONFIG = {
    MAX_RES_CACHE_SIZE: 1000, // ResCache 最大缓存数量
    MAX_RES_CACHE_MEMORY: 148 * 1024 * 1024, // ResCache 最大内存 148MB
    ENABLE_CACHE_LOGGING: true // 是否启用缓存日志
};

/**
 * 配置缓存参数
 */
export function configureCache(options: {
    maxSize?: number;
    maxMemory?: number;
    enableLogging?: boolean;
}): void {
    if (options.maxSize != null && options.maxSize >= 0) {
        CACHE_CONFIG.MAX_RES_CACHE_SIZE = options.maxSize;
    }
    if (options.maxMemory != null && options.maxMemory >= 0) {
        CACHE_CONFIG.MAX_RES_CACHE_MEMORY = options.maxMemory;
    }
    if (typeof options.enableLogging === 'boolean') {
        CACHE_CONFIG.ENABLE_CACHE_LOGGING = options.enableLogging;
    }
}

/**
 * 获取当前缓存配置
 */
export function getCacheConfig(): { maxSize: number; maxMemory: number; enableLogging: boolean } {
    return {
        maxSize: CACHE_CONFIG.MAX_RES_CACHE_SIZE,
        maxMemory: CACHE_CONFIG.MAX_RES_CACHE_MEMORY,
        enableLogging: CACHE_CONFIG.ENABLE_CACHE_LOGGING
    };
}

// ============================== 类型定义 ==============================

// ZIP 文件条目接口
interface ZipEntry {
    fileName: string;
    compressedSize: number;
    uncompressedSize: number;
    compressionMethod: number;
    crc32: number;
    localHeaderOffset: number;
    data: Uint8Array;
}

// ZIP 文件对象接口
interface ZipFileObject {
    name: string;
    dir: boolean;
    async: (type: string) => Promise<any>;
}

// 扩展的 XMLHttpRequest 类型
interface ExtendedXHR extends XMLHttpRequest {
    zipCacheUrl?: string;
    zipCachePath?: string;
    isFromCache?: boolean;
}

// ============================== 全局缓存 ==============================

// 资源缓存Map（存储处理后的最终资源）
const ResCache = new Map<string, any>();
// 资源缓存大小（字节）
const ResCacheSize = new Map<string, number>();
// 资源缓存当前总内存（字节）
let ResCacheTotalMemory = 0;

// ZIP文件缓存Map（存储ZIP解压的原始数据，临时使用）
const ZipCache = new Map<string, ZipFileObject>();

// ResCache 使用记录（LRU策略）
const ResCacheAccessTime = new Map<string, number>();

// ============================== 全局日志管理 ==============================

/**
 * 全局日志开关
 */
let globalLogEnabled = true;

/**
 * 设置全局日志开关
 * @param enabled 是否启用日志
 */
export function setGlobalLogEnabled(enabled: boolean): void {
    globalLogEnabled = enabled;
}

/**
 * 获取全局日志开关状态
 * @returns 是否启用日志
 */
export function isGlobalLogEnabled(): boolean {
    return globalLogEnabled;
}

/**
 * 条件日志输出函数
 * @param level 日志级别
 * @param message 日志消息
 * @param ...args 额外参数
 */
function logIfEnabled(level: 'log' | 'error' | 'warn' | 'info', message: string, ...args: any[]): void {
    if (globalLogEnabled) {
        console[level](message, ...args);
    }
}

// ============================== 工具函数 ==============================

/**
 * 简单的 ZIP 解密实现（使用 XOR 解密）
 */
const decryptData = (data: Uint8Array, password: string): Uint8Array => {
    if (!password) return data;

    const passwordBytes = new TextEncoder().encode(password);
    const decryptedData = new Uint8Array(data.length);

    for (let i = 0; i < data.length; i++) {
        const keyByte = passwordBytes[i % passwordBytes.length];
        decryptedData[i] = data[i] ^ keyByte;
    }

    return decryptedData;
};

/**
 * 从 URL 中提取文件路径（移除 'remote/' 或 'assets/' 前缀）
 */
const extractFilePath = (url: string): string => {
    const pathMatch = url.match(/(?:remote|assets)\/(.+)$/);
    return pathMatch ? pathMatch[1] : url;
};

/**
 * 更新 ResCache 访问时间
 */
const updateResCacheAccessTime = (url: string): void => {
    ResCacheAccessTime.set(url, Date.now());
};

/**
 * 缓存资源到 ResCache
 */
const estimateResourceSize = (resource: any): number => {
    if (!resource) return 0;
    // ArrayBuffer / Uint8Array / typed arrays
    if (resource instanceof ArrayBuffer) return resource.byteLength || 0;
    if (ArrayBuffer.isView(resource) && resource.buffer) return resource.byteLength || 0;
    // Blob
    if (typeof Blob !== "undefined" && resource instanceof Blob) return resource.size || 0;
    // String (UTF-16 approx or treat as UTF-8 length)
    if (typeof resource === "string") return resource.length * 2;
    // Image (approx RGBA)
    if (typeof Image !== "undefined" && resource instanceof Image) {
        const w = (resource.naturalWidth || (resource as any).width || 0) as number;
        const h = (resource.naturalHeight || (resource as any).height || 0) as number;
        return w > 0 && h > 0 ? w * h * 4 : 1024 * 1024; // 1MB fallback
    }
    // Fallback for objects
    try {
        return JSON.stringify(resource).length;
    } catch {
        return 0;
    }
};

const enforceResCacheLimits = (): void => {
    // 数量限制（按 LRU 清理 30%）
    if (ResCache.size > CACHE_CONFIG.MAX_RES_CACHE_SIZE) {
        const entries = Array.from(ResCacheAccessTime.entries()).sort((a, b) => a[1] - b[1]);
        const deleteCount = Math.max(1, Math.floor(ResCache.size * 0.3));
        for (let i = 0; i < deleteCount && i < entries.length; i++) {
            const [key] = entries[i];
            const old = ResCacheSize.get(key) || 0;
            ResCache.delete(key);
            ResCacheAccessTime.delete(key);
            ResCacheSize.delete(key);
            ResCacheTotalMemory -= old;
        }
        logIfEnabled('log', `[ZipLoader] ResCache 触发数量清理，已清理 ${deleteCount} 项，剩余 ${ResCache.size} 项`);
    }

    // 内存限制（按 LRU 清理直到达标）
    if (ResCacheTotalMemory > CACHE_CONFIG.MAX_RES_CACHE_MEMORY) {
        const entries = Array.from(ResCacheAccessTime.entries()).sort((a, b) => a[1] - b[1]);
        let removed = 0;
        for (let i = 0; i < entries.length && ResCacheTotalMemory > CACHE_CONFIG.MAX_RES_CACHE_MEMORY; i++) {
            const [key] = entries[i];
            if (!ResCache.has(key)) continue;
            const size = ResCacheSize.get(key) || 0;
            ResCache.delete(key);
            ResCacheAccessTime.delete(key);
            ResCacheSize.delete(key);
            ResCacheTotalMemory -= size;
            removed++;
        }
        logIfEnabled('log', `[ZipLoader] ResCache 触发内存清理，移除 ${removed} 项，当前内存 ${(ResCacheTotalMemory/1024/1024).toFixed(2)}MB`);
    }
};

const cacheResource = (url: string, resource: any): void => {
    // 移除旧值占用
    if (ResCache.has(url)) {
        const oldSize = ResCacheSize.get(url) || 0;
        ResCacheTotalMemory -= oldSize;
    }

    ResCache.set(url, resource);
    updateResCacheAccessTime(url);

    const size = estimateResourceSize(resource);
    ResCacheSize.set(url, size);
    ResCacheTotalMemory += size;

    enforceResCacheLimits();
};

/**
 * 创建加载失败的错误
 */
const createLoadError = (message: string, detail?: any): Error => {
    return new Error(detail instanceof Event ? detail.type : String(detail || message));
};

/**
 * 格式化字节为 MB
 */
const formatSizeToMB = (bytes: number): string => {
    return (bytes / (1024 * 1024)).toFixed(2) + "M";
};

// ============================== ZIP 解析 ==============================

/**
 * 解析 ZIP 文件
 */
const parseZipFile = (data: ArrayBuffer, password: string = ""): Map<string, ZipEntry> => {
    const entries = new Map<string, ZipEntry>();
    const view = new DataView(data);

    // 1. 查找中央目录结束记录
    const endRecordOffset = findEndRecord(view, data.byteLength);
    if (endRecordOffset === -1) {
        throw new Error("Invalid ZIP file: End record not found");
    }

    // 2. 读取中央目录信息
    const centralDirEntries = view.getUint16(endRecordOffset + 10, true);
    const centralDirOffset = view.getUint32(endRecordOffset + 16, true);

    // 3. 解析所有文件条目
    let offset = centralDirOffset;
    for (let i = 0; i < centralDirEntries; i++) {
        const entry = parseZipEntry(data, view, offset, password);
        entries.set(entry.fileName, entry);
        offset =
            entry.localHeaderOffset +
            46 +
            view.getUint16(entry.localHeaderOffset + 28, true) +
            view.getUint16(entry.localHeaderOffset + 30, true) +
            view.getUint16(entry.localHeaderOffset + 32, true);
    }

    return entries;
};

/**
 * 查找 ZIP 文件的结束记录
 */
const findEndRecord = (view: DataView, byteLength: number): number => {
    for (let i = byteLength - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === ZIP_END_SIGNATURE) {
            return i;
        }
    }
    return -1;
};

/**
 * 解析单个 ZIP 条目
 */
const parseZipEntry = (data: ArrayBuffer, view: DataView, offset: number, password: string): ZipEntry => {
    // 验证中央目录签名
    if (view.getUint32(offset, true) !== ZIP_CENTRAL_SIGNATURE) {
        throw new Error("Invalid ZIP file: Central directory signature not found");
    }

    // 读取文件元数据
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const crc32 = view.getUint32(offset + 16, true);

    // 读取文件名
    const fileName = new TextDecoder().decode(new Uint8Array(data, offset + 46, fileNameLength));

    // 读取文件数据
    const fileData = readZipFileData(data, view, localHeaderOffset, compressedSize, password);

    // 解压数据
    const uncompressedData = decompressData(fileData, compressionMethod, uncompressedSize);

    return {
        fileName,
        compressedSize,
        uncompressedSize,
        compressionMethod,
        crc32,
        localHeaderOffset: offset,
        data: uncompressedData
    };
};

/**
 * 读取 ZIP 文件数据
 */
const readZipFileData = (
    data: ArrayBuffer,
    view: DataView,
    localHeaderOffset: number,
    compressedSize: number,
    password: string
): Uint8Array => {
    // 验证本地文件头签名
    if (view.getUint32(localHeaderOffset, true) !== ZIP_SIGNATURE) {
        throw new Error("Invalid ZIP file: Local header signature not found");
    }

    // 计算文件数据偏移
    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraFieldLength = view.getUint16(localHeaderOffset + 28, true);
    const fileDataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;

    // 读取压缩数据
    let fileData = new Uint8Array(data, fileDataOffset, compressedSize);

    // 检查是否加密
    const flags = view.getUint16(localHeaderOffset + 6, true);
    const isEncrypted = (flags & 1) !== 0;

    // 如果加密，先解密
    if (isEncrypted && password) {
        fileData = decryptData(fileData, password);
    }

    return fileData;
};

/**
 * 解压数据
 */
const decompressData = (fileData: Uint8Array, compressionMethod: number, uncompressedSize: number): Uint8Array => {
    if (compressionMethod === ZIP_COMPRESSION_DEFLATE) {
        return fflate.default.inflateSync(fileData, { out: new Uint8Array(uncompressedSize) });
    } else if (compressionMethod === ZIP_COMPRESSION_STORE) {
        return fileData;
    } else {
        throw new Error(`Unsupported compression method: ${compressionMethod}`);
    }
};

/**
 * 创建 ZIP 文件对象（类似 JSZip 的接口）
 */
const createZipFileObject = (path: string, entry: ZipEntry): ZipFileObject => {
    return {
        name: path,
        dir: false,
        async: (type: string) => {
            return new Promise((resolve, reject) => {
                try {
                    switch (type) {
                        case "uint8array":
                            resolve(entry.data);
                            break;
                        case "text":
                            resolve(new TextDecoder().decode(entry.data));
                            break;
                        case "base64":
                            resolve(btoa(String.fromCharCode(...entry.data)));
                            break;
                        case "blob":
                            resolve(new Blob([entry.data]));
                            break;
                        default:
                            resolve(entry.data);
                    }
                } catch (error) {
                    reject(error);
                }
            });
        }
    };
};

// ============================== ZipLoader 类 ==============================

export class ZipLoader {
    private static _instance: ZipLoader | null = null;
    private _isInit: boolean = false;
    private _remoteUrl: string = "";
    private _password: string = "";

    // -------------------- 单例模式 --------------------

    static get instance(): ZipLoader {
        if (!this._instance) {
            this._instance = new ZipLoader();
        }
        return this._instance;
    }

    /**
     * 设置全局日志开关
     */
    static setLogEnabled(enabled: boolean): void {
        setGlobalLogEnabled(enabled);
    }

    /**
     * 获取全局日志开关状态
     */
    static isLogEnabled(): boolean {
        return isGlobalLogEnabled();
    }

    /**
     * 配置 ResCache 参数
     */
    static configureResCache(options: { maxSize?: number; maxMemory?: number; enableLogging?: boolean }): void {
        configureCache(options);
    }

    /**
     * 获取当前 ResCache 配置
     */
    static getResCacheConfig(): { maxSize: number; maxMemory: number; enableLogging: boolean } {
        return getCacheConfig();
    }

    // -------------------- 属性访问器 --------------------

    public set remoteUrl(value: string) {
        this._remoteUrl = value;
    }

    public get remoteUrl(): string {
        return this._remoteUrl;
    }

    public set password(value: string) {
        this._password = value;
    }

    public get password(): string {
        return this._password;
    }

    // -------------------- 缓存访问 --------------------

    public getZipCache(): Map<string, ZipFileObject> {
        return ZipCache;
    }

    public getResCache(): Map<string, any> {
        return ResCache;
    }

    // -------------------- 缓存管理 --------------------

    /**
     * 清理 ResCache（按 LRU 策略）
     * @param clearAll 是否清空所有缓存
     */
    public clearResCache(clearAll: boolean = false): void {
        if (clearAll) {
            const size = ResCache.size;
            ResCache.clear();
            ResCacheAccessTime.clear();
            ResCacheSize.clear();
            ResCacheTotalMemory = 0;
            logIfEnabled('log', `[ZipLoader] ResCache 已全部清理，共 ${size} 项`);
            return;
        }

        // 统一由 enforceResCacheLimits 控制
        enforceResCacheLimits();
    }

    /**
     * 清理 ZipCache
     */
    public clearZipCache(): void {
        const size = ZipCache.size;
        ZipCache.clear();
        logIfEnabled('log', `[ZipLoader] ZipCache 已清理，共 ${size} 项`);
    }

    // -------------------- ZIP 加载 --------------------

    /**
     * 下载 ZIP 文件
     */
    public downloadZip(path: string, isUsert: boolean = false): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.responseType = "arraybuffer";

            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve(xhr.response);
                } else {
                    reject(new Error(`Download failed: ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error("Download failed"));
            xhr.open("GET", `${path}.zip${isUsert ? "?t=" + Date.now() : ""}`, true);
            xhr.send();
        });
    }

    /**
     * 加载并解析 ZIP 包
     * @param bundleName bundle 名称
     * @param onProgress 进度回调
     */
    public async loadZip(bundleName: string, isUsert: boolean = false): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                // 确保只初始化一次
                if (!this._isInit) {
                    this._initImageLoaders();
                    this._hookXMLHttpRequest();
                    this._isInit = true;
                    logIfEnabled('log', "[ZipLoader] 初始化完成");
                }

                // 下载 ZIP 文件
                const zipData = await this.downloadZip(`${this._remoteUrl}/${bundleName}`, isUsert);

                // 解析 ZIP 内容到缓存
                this._parseZip(zipData);

                // 检查并清理 ResCache
                this.clearResCache(false);

                resolve();
            } catch (error) {
                logIfEnabled('error', "[ZipLoader] Load zip failed:", error);
                reject(error);
            }
        });
    }

    // -------------------- 私有方法：ZIP 解析 --------------------

    /**
     * 解析 ZIP 内容并缓存到 ZipCache
     */
    private _parseZip(data: ArrayBuffer): void {
        try {
            const entries = parseZipFile(data, this._password);

            // 缓存所有文件
            for (const [path, entry] of entries) {
                const fileObject = createZipFileObject(path, entry);
                ZipCache.set(path, fileObject);
            }

            logIfEnabled('log', `[ZipLoader] ZIP 解析完成，缓存了 ${entries.size} 个文件`);
        } catch (error) {
            logIfEnabled('error', "[ZipLoader] Parse zip failed:", error);
            throw error;
        }
    }

    // -------------------- 私有方法：图片加载器 --------------------

    /**
     * 初始化所有图片格式的加载器
     */
    private _initImageLoaders(): void {
        IMAGE_EXTENSIONS.forEach((ext) => {
            this._registerImageLoader(ext);
        });
    }

    /**
     * 注册单个图片格式的加载器
     */
    private _registerImageLoader(extension: string): void {
        const isTextureFormat = TEXTURE_FORMATS.indexOf(extension) !== -1;
        const downloadHandler = (url: string, options: any, onComplete: Function) => {
            this._handleImageDownload(url, extension, isTextureFormat, onComplete);
        };

        if (cc.assetManager?.downloader) {
            cc.assetManager.downloader.register(extension, downloadHandler);
        }
    }

    /**
     * 处理图片下载（缓存优先）
     */
    private _handleImageDownload(url: string, extension: string, isTextureFormat: boolean, onComplete: Function): void {
        // 1. 检查 ResCache
        if (ResCache.has(url)) {
            updateResCacheAccessTime(url);
            if (CACHE_CONFIG.ENABLE_CACHE_LOGGING) {
                logIfEnabled('log', `[ZipLoader] 命中 ResCache: ${url}`);
            }
            onComplete(null, ResCache.get(url));
            return;
        }

        // 2. 检查 ZipCache
        const filePath = extractFilePath(url);
        if (ZipCache.has(filePath)) {
            this._loadFromZipCache(url, filePath, extension, isTextureFormat, onComplete);
            return;
        }

        // 3. 从网络下载
        this._downloadFromNetwork(url, isTextureFormat, onComplete);
    }

    /**
     * 从 ZipCache 加载资源
     */
    private _loadFromZipCache(
        url: string,
        filePath: string,
        extension: string,
        isTextureFormat: boolean,
        onComplete: Function
    ): void {
        logIfEnabled('log', `[ZipLoader] 使用 ZipCache: ${filePath}`);
        const cache = ZipCache.get(filePath);
        if (!cache) return;

        cache
            .async("uint8array")
            .then((data: Uint8Array) => {
                if (isTextureFormat) {
                    this._handleTextureData(url, filePath, data, onComplete);
                } else if (data.length > IMAGE_SIZE_THRESHOLD) {
                    this._handleLargeImage(url, filePath, cache, data, onComplete);
                } else {
                    this._handleSmallImage(url, filePath, extension, cache, data, onComplete);
                }
            })
            .catch((error: any) => {
                logIfEnabled('error', "[ZipLoader] Load from ZipCache failed:", error);
                onComplete(error, null);
            });
    }

    /**
     * 处理纹理数据
     */
    private _handleTextureData(url: string, filePath: string, data: Uint8Array, onComplete: Function): void {
        logIfEnabled('log', `[ZipLoader] 加载纹理: ${filePath}, 大小: ${formatSizeToMB(data.length)}`);
        cacheResource(url, data);
        ZipCache.delete(filePath);
        onComplete(null, data);
    }

    /**
     * 处理大图片（使用 Blob 方式）
     */
    private _handleLargeImage(
        url: string,
        filePath: string,
        cache: ZipFileObject,
        data: Uint8Array,
        onComplete: Function
    ): void {
        logIfEnabled('log', `[ZipLoader] 加载大图片(Blob): ${filePath}, 大小: ${formatSizeToMB(data.length)}`);

        cache.async("blob").then((blob: any) => {
            const objectUrl = URL.createObjectURL(blob);
            this._loadImageFromUrl(
                objectUrl,
                (img: HTMLImageElement) => {
                    URL.revokeObjectURL(objectUrl);
                    cacheResource(url, img);
                    ZipCache.delete(filePath);
                    logIfEnabled('log', `[ZipLoader] 图片加载成功: ${filePath}`);
                    onComplete(null, img);
                },
                (error: any) => {
                    URL.revokeObjectURL(objectUrl);
                    logIfEnabled('error', `[ZipLoader] 图片加载失败: ${filePath}`, error);
                    onComplete(createLoadError("Image load failed", error), null);
                }
            );
        });
    }

    /**
     * 处理小图片（使用 Base64 方式）
     */
    private _handleSmallImage(
        url: string,
        filePath: string,
        extension: string,
        cache: ZipFileObject,
        data: Uint8Array,
        onComplete: Function
    ): void {
        logIfEnabled('log', `[ZipLoader] 加载小图片(Base64): ${filePath}, 大小: ${formatSizeToMB(data.length)}`);

        cache.async("base64").then((base64: string) => {
            const dataUrl = `data:image/${extension.slice(1)};base64,${base64}`;
            this._loadImageFromUrl(
                dataUrl,
                (img: HTMLImageElement) => {
                    cacheResource(url, img);
                    ZipCache.delete(filePath);
                    logIfEnabled('log', `[ZipLoader] 图片加载成功: ${filePath}`);
                    onComplete(null, img);
                },
                (error: any) => {
                    logIfEnabled('error', `[ZipLoader] 图片加载失败: ${filePath}`, error);
                    onComplete(createLoadError("Image load failed", error), null);
                }
            );
        });
    }

    /**
     * 从 URL 加载图片（通用方法）
     */
    private _loadImageFromUrl(
        src: string,
        onSuccess: (img: HTMLImageElement) => void,
        onError: (error: any) => void
    ): void {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => onSuccess(img);
        img.onerror = (e) => onError(e);
        img.src = src;
    }

    /**
     * 从网络下载资源
     */
    private _downloadFromNetwork(url: string, isTextureFormat: boolean, onComplete: Function): void {
        if (isTextureFormat) {
            // 纹理格式直接下载 ArrayBuffer
            const xhr = new XMLHttpRequest();
            xhr.responseType = "arraybuffer";
            xhr.onload = () => {
                if (xhr.status === 200) {
                    cacheResource(url, xhr.response);
                    onComplete(null, xhr.response);
                } else {
                    onComplete(new Error(`Download failed: ${xhr.status}`), null);
                }
            };
            xhr.onerror = () => onComplete(new Error("Download failed"), null);
            xhr.open("GET", url, true);
            xhr.send();
        } else {
            // 普通图片直接加载
            this._loadImageFromUrl(
                url,
                (img) => onComplete(null, img),
                (e) => onComplete(createLoadError("Image download failed", e), null)
            );
        }
    }

    // -------------------- 私有方法：XMLHttpRequest 拦截 --------------------

    /**
     * 拦截 XMLHttpRequest 请求以使用缓存
     */
    private _hookXMLHttpRequest(): void {
        const accessor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "response");
        if (!accessor) return;

        this._hookXHROpen();
        this._hookXHRSend();
        this._hookXHRResponse(accessor);
    }

    /**
     * Hook XMLHttpRequest.open 方法
     */
    private _hookXHROpen(): void {
        const oldOpen = XMLHttpRequest.prototype.open;

        XMLHttpRequest.prototype.open = function (
            this: ExtendedXHR,
            method: string,
            url: string,
            async?: boolean,
            username?: string | null,
            password?: string | null
        ) {
            const filePath = extractFilePath(url);

            // 检查缓存（优先 ResCache）
            if (ResCache.has(url)) {
                logIfEnabled('log', `[ZipLoader] XHR拦截 - 检测到 ResCache: ${url}`);
                this.zipCacheUrl = url;
                this.zipCachePath = filePath;
                this.isFromCache = true;
            } else if (ZipCache.has(filePath)) {
                logIfEnabled('log', `[ZipLoader] XHR拦截 - 检测到 ZipCache: ${filePath}`);
                this.zipCacheUrl = url;
                this.zipCachePath = filePath;
                this.isFromCache = false;
            } else {
                this.zipCacheUrl = undefined;
                this.zipCachePath = undefined;
                this.isFromCache = undefined;
            }

            return oldOpen.call(this, method, url, async ?? true, username, password);
        };
    }

    /**
     * Hook XMLHttpRequest.send 方法
     */
    private _hookXHRSend(): void {
        const oldSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.send = async function (
            this: ExtendedXHR,
            data?: Document | XMLHttpRequestBodyInit | null
        ) {
            // 如果有缓存，使用缓存数据
            if (this.zipCacheUrl && this.zipCachePath !== undefined) {
                await handleCachedRequest(this);
                return;
            }

            // 否则执行正常的网络请求
            return oldSend.call(this, data);
        };
    }

    /**
     * Hook XMLHttpRequest.response 属性
     */
    private _hookXHRResponse(accessor: PropertyDescriptor): void {
        Object.defineProperty(XMLHttpRequest.prototype, "response", {
            get: function (this: ExtendedXHR) {
                if (this.zipCacheUrl && ResCache.has(this.zipCacheUrl)) {
                    const res = ResCache.get(this.zipCacheUrl);
                    updateResCacheAccessTime(this.zipCacheUrl);
                    logIfEnabled('log', `[ZipLoader] 返回缓存响应: ${this.zipCachePath}, 类型: ${this.responseType || "default"}`);
                    return this.responseType === "json" ? JSON.parse(res) : res;
                }
                return accessor.get ? accessor.get.call(this) : undefined;
            },
            set: function () {},
            configurable: true
        });
    }
}

// ============================== XHR 缓存处理 ==============================

/**
 * 处理缓存的请求
 */
async function handleCachedRequest(xhr: ExtendedXHR): Promise<void> {
    try {
        // 如果 ResCache 中已有数据，直接使用
        if (xhr.isFromCache) {
            logIfEnabled('log', `[ZipLoader] XHR 直接使用 ResCache: ${xhr.zipCacheUrl}`);
            updateResCacheAccessTime(xhr.zipCacheUrl!);
        }
        // 如果只在 ZipCache 中，需要加载到 ResCache
        else if (!ResCache.has(xhr.zipCacheUrl!)) {
            await loadFromZipCacheToResCache(xhr);
        }

        // 设置 HTTP 状态（模拟成功响应）
        setXHRStatus(xhr, 200, "OK", 4);

        // 触发 onload 事件
        triggerXHRLoad(xhr);
    } catch (error) {
        logIfEnabled('error', `[ZipLoader] 缓存资源加载失败: ${xhr.zipCachePath}`, error);
        triggerXHRError(xhr);
    }
}

/**
 * 从 ZipCache 加载到 ResCache
 */
async function loadFromZipCacheToResCache(xhr: ExtendedXHR): Promise<void> {
    const cache = ZipCache.get(xhr.zipCachePath!);
    if (!cache) return;

    const responseType = xhr.responseType || "text";
    logIfEnabled('log', `[ZipLoader] XHR 加载 ZipCache 资源: ${xhr.zipCachePath}, 类型: ${responseType}`);

    if (xhr.responseType === "json") {
        const text = await cache.async("text");
        cacheResource(xhr.zipCacheUrl!, text);
        logIfEnabled('log', `[ZipLoader] JSON 资源加载成功: ${xhr.zipCachePath}`);
    } else {
        const res = await cache.async(responseType);
        cacheResource(xhr.zipCacheUrl!, res);
        logIfEnabled('log', `[ZipLoader] 资源加载成功: ${xhr.zipCachePath}, 类型: ${responseType}`);
    }

    ZipCache.delete(xhr.zipCachePath!);
}

/**
 * 设置 XHR 状态
 */
function setXHRStatus(xhr: ExtendedXHR, status: number, statusText: string, readyState: number): void {
    Object.defineProperty(xhr, "status", {
        get: () => status,
        configurable: true
    });
    Object.defineProperty(xhr, "statusText", {
        get: () => statusText,
        configurable: true
    });
    Object.defineProperty(xhr, "readyState", {
        get: () => readyState,
        configurable: true
    });
}

/**
 * 触发 XHR load 事件
 */
function triggerXHRLoad(xhr: ExtendedXHR): void {
    if (typeof xhr.onload === "function") {
        const event = new ProgressEvent("load", {
            lengthComputable: true,
            loaded: 1,
            total: 1
        });
        xhr.onload(event);
    }
}

/**
 * 触发 XHR error 事件
 */
function triggerXHRError(xhr: ExtendedXHR): void {
    if (xhr.onerror) {
        const errorEvent = new ProgressEvent("error", {
            lengthComputable: false,
            loaded: 0,
            total: 0
        });
        xhr.onerror(errorEvent);
    }
}
