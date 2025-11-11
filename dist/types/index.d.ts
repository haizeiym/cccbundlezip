/**
 * 配置缓存参数
 */
export declare function configureCache(options: {
    maxSize?: number;
    maxMemory?: number;
    enableLogging?: boolean;
}): void;
/**
 * 获取当前缓存配置
 */
export declare function getCacheConfig(): {
    maxSize: number;
    maxMemory: number;
    enableLogging: boolean;
};
interface ZipFileObject {
    async: (type: string) => Promise<any>;
}
/**
 * 设置全局日志开关
 * @param enabled 是否启用日志
 */
export declare function setGlobalLogEnabled(enabled: boolean): void;
/**
 * 获取全局日志开关状态
 * @returns 是否启用日志
 */
export declare function isGlobalLogEnabled(): boolean;
export declare class ZipLoader {
    private static _instance;
    private _isInit;
    private _remoteUrl;
    private _password;
    static get instance(): ZipLoader;
    /**
     * 设置全局日志开关
     */
    static setLogEnabled(enabled: boolean): void;
    /**
     * 获取全局日志开关状态
     */
    static isLogEnabled(): boolean;
    /**
     * 配置 ResCache 参数
     */
    static configureResCache(options: {
        maxSize?: number;
        maxMemory?: number;
        enableLogging?: boolean;
    }): void;
    /**
     * 获取当前 ResCache 配置
     */
    static getResCacheConfig(): {
        maxSize: number;
        maxMemory: number;
        enableLogging: boolean;
    };
    set remoteUrl(value: string);
    get remoteUrl(): string;
    set password(value: string);
    get password(): string;
    getZipCache(): Map<string, ZipFileObject>;
    getResCache(): Map<string, any>;
    /**
     * 清理 ResCache（按 LRU 策略）
     * @param clearAll 是否清空所有缓存
     */
    clearResCache(clearAll?: boolean): void;
    /**
     * 清理 ZipCache
     */
    clearZipCache(): void;
    /**
     * 下载 ZIP 文件
     */
    downloadZip(path: string, isUsert?: boolean): Promise<ArrayBuffer>;
    /**
     * 加载并解析 ZIP 包
     * @param bundleName bundle 名称
     * @param onProgress 进度回调
     */
    loadZip(bundleName: string, isUsert?: boolean): Promise<void>;
    /**
     * 解析 ZIP 内容并缓存到 ZipCache
     */
    private _parseZip;
    /**
     * 初始化所有图片格式的加载器
     */
    private _initImageLoaders;
    /**
     * 注册单个图片格式的加载器
     */
    private _registerImageLoader;
    /**
     * 处理图片下载（缓存优先）
     */
    private _handleImageDownload;
    /**
     * 从 ZipCache 加载资源
     */
    private _loadFromZipCache;
    /**
     * 处理纹理数据
     */
    private _handleTextureData;
    /**
     * 处理大图片（使用 Blob 方式）
     */
    private _handleLargeImage;
    /**
     * 处理小图片（使用 Base64 方式）
     */
    private _handleSmallImage;
    /**
     * 从 URL 加载图片（通用方法）
     */
    private _loadImageFromUrl;
    /**
     * 从网络下载资源
     */
    private _downloadFromNetwork;
    /**
     * 拦截 XMLHttpRequest 请求以使用缓存
     */
    private _hookXMLHttpRequest;
    /**
     * Hook XMLHttpRequest.open 方法
     */
    private _hookXHROpen;
    /**
     * Hook XMLHttpRequest.send 方法
     */
    private _hookXHRSend;
    /**
     * Hook XMLHttpRequest.response 属性
     */
    private _hookXHRResponse;
}
export {};
