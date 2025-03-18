export declare class ZipLoader {
    private static _instance;
    private _isInit;
    static get instance(): ZipLoader;
    private _remoteUrl;
    set remoteUrl(value: string);
    get remoteUrl(): string;
    getZipCache(): Map<string, any>;
    getResCache(): Map<string, any>;
    /**
     * 下载zip文件
     */
    downloadZip(path: string): Promise<ArrayBuffer>;
    /**
     * 注入图片下载处理
     */
    private _injectDownloadImage;
    /**
     * 初始化图片加载器
     */
    private _initImageLoaders;
    /**
     * 加载并解析zip包
     */
    loadZip(bundleName: string, onProgress?: (progress: number) => void): Promise<void>;
    /**
     * 解析zip内容
     */
    private _parseZip;
    /**
     * 拦截XMLHttpRequest请求
     */
    private _hookXMLHttpRequest;
}
