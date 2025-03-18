// 声明 cc 命名空间
declare const cc: {
    assetManager?: {
        downloader: {
            register: (extension: string, handler: Function) => void;
        };
    };
    loader?: {
        _downloader: {
            extMap: { [key: string]: Function };
        };
    };
    warn?: (...args: any[]) => void;
    error?: (...args: any[]) => void;
};

import JSZip from "jszip";
// 资源缓存Map
const ResCache = new Map<string, any>();
// ZIP文件缓存Map
const ZipCache = new Map<string, any>();

export class ZipLoader {
    private static _instance: ZipLoader | null = null;
    private _isInit: boolean = false;

    static get instance(): ZipLoader {
        if (!this._instance) {
            this._instance = new ZipLoader();
            this._instance._isInit = false;
        }
        return this._instance;
    }

    private _remoteUrl: string = "";

    public set remoteUrl(value: string) {
        this._remoteUrl = value;
    }

    /**
     * 下载zip文件
     */
    public downloadZip(path: string): Promise<ArrayBuffer> {
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
            xhr.open("GET", path + ".zip", true);
            xhr.send();
        });
    }

    /**
     * 注入图片下载处理
     */
    private _injectDownloadImage(extension: string) {
        // 图片大小阈值：2MB
        const SIZE_THRESHOLD = 2 * 1024 * 1024;

        const downloadHandler = (url: string, options: any, onComplete: Function) => {
            if (ResCache.has(url)) {
                const res = ResCache.get(url);
                onComplete(null, res);
                return;
            }

            if (ZipCache.has(url)) {
                const cache = ZipCache.get(url);
                if (cache) {
                    cache
                        .async("uint8array")
                        .then((data: Uint8Array) => {
                            if (data.length > SIZE_THRESHOLD) {
                                return cache.async("blob").then((blob: any) => {
                                    const objectUrl = URL.createObjectURL(blob);
                                    const img = new Image();
                                    img.crossOrigin = "anonymous";
                                    img.onload = () => {
                                        URL.revokeObjectURL(objectUrl);
                                        ResCache.set(url, img);
                                        ZipCache.delete(url);
                                        onComplete(null, img);
                                    };
                                    img.onerror = (e) => {
                                        URL.revokeObjectURL(objectUrl);
                                        onComplete(new Error(e instanceof Event ? e.type : String(e)), null);
                                    };
                                    img.src = objectUrl;
                                });
                            } else {
                                return cache.async("base64").then((base64: string) => {
                                    const img = new Image();
                                    img.crossOrigin = "anonymous";
                                    img.onload = () => {
                                        ResCache.set(url, img);
                                        ZipCache.delete(url);
                                        onComplete(null, img);
                                    };
                                    img.onerror = (e) => {
                                        onComplete(new Error(e instanceof Event ? e.type : String(e)), null);
                                    };
                                    img.src = `data:image/${extension.slice(1)};base64,${base64}`;
                                });
                            }
                        })
                        .catch((error: any) => {
                            console.error("[ZipLoader] Load image failed:", error);
                            onComplete(error, null);
                        });
                    return;
                }
            }

            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => onComplete(null, img);
            img.onerror = (e) => onComplete(new Error(e instanceof Event ? e.type : String(e)), null);
            img.src = url;
        };

        // 兼容 CocosCreator 2.4.14 和 3.8.5
        if (cc.assetManager?.downloader) {
            // CocosCreator 3.x
            cc.assetManager.downloader.register(extension, downloadHandler);
        } else if (cc.loader?._downloader) {
            // CocosCreator 2.x
            cc.loader._downloader.extMap[extension.slice(1)] = downloadHandler;
        }
    }

    /**
     * 初始化图片加载器
     */
    private _initImageLoaders() {
        // 支持的图片格式
        const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".bmp"];

        // 注册所有支持的图片格式
        imageExtensions.forEach((ext) => {
            this._injectDownloadImage(ext);
        });
    }

    /**
     * 加载并解析zip包
     */
    public async loadZip(bundleName: string, onProgress?: (progress: number) => void): Promise<void> {
        try {
            if (!this._isInit) {
                this._initImageLoaders();
                this._hookXMLHttpRequest();
                this._isInit = true;
            }

            // 下载zip文件
            const zipData = await this.downloadZip(`${this._remoteUrl}/${bundleName}`);

            // 解析zip内容
            await this._parseZip(zipData, bundleName);

            // 调用进度回调
            onProgress?.(1);
        } catch (error) {
            console.error("[ZipLoader] Load zip failed:", error);
            throw error;
        }
    }

    /**
     * 解析zip内容
     */
    private async _parseZip(data: ArrayBuffer, bundleName: string) {
        const zip = new JSZip();
        try {
            const contents = await zip.loadAsync(data);

            // 遍历所有文件
            for (const path in contents.files) {
                const file = contents.files[path];
                if (!file.dir) {
                    // 缓存zip文件
                    const fullPath = `assets/${bundleName}/${path}`;
                    ZipCache.set(fullPath, file);
                }
            }
        } catch (error) {
            console.error("[ZipLoader] Parse zip failed:", error);
            throw error;
        }
    }

    /**
     * 拦截XMLHttpRequest请求
     */
    private _hookXMLHttpRequest() {
        if (this._isInit) return;
        this._isInit = true;
        
        const accessor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "response");
        if (!accessor) return;

        const oldOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { zipCacheUrl?: string }, method: string, url: string, async?: boolean, username?: string | null, password?: string | null) {
            if (ZipCache.has(url)) {
                this.zipCacheUrl = url;
            } else {
                this.zipCacheUrl = undefined;
            }
            return oldOpen.call(this, method, url, async ?? true, username, password);
        };

        const oldSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = async function (this: XMLHttpRequest & { zipCacheUrl?: string }, data?: Document | XMLHttpRequestBodyInit | null) {
            if (this.zipCacheUrl) {
                if (!ResCache.has(this.zipCacheUrl)) {
                    const cache = ZipCache.get(this.zipCacheUrl);
                    if (cache) {
                        try {
                            if (this.responseType === "json") {
                                const text = await cache.async("text");
                                ResCache.set(this.zipCacheUrl, text);
                            } else {
                                const res = await cache.async(this.responseType || "text");
                                ResCache.set(this.zipCacheUrl, res);
                            }
                            ZipCache.delete(this.zipCacheUrl);
                        } catch (error) {
                            if (this.onerror) {
                                const errorEvent = new ProgressEvent("error", {
                                    lengthComputable: false,
                                    loaded: 0,
                                    total: 0
                                });
                                this.onerror(errorEvent);
                            }
                            return;
                        }
                    }
                }

                if (typeof this.onload === "function") {
                    const event = new ProgressEvent("load", {
                        lengthComputable: false,
                        loaded: 0,
                        total: 0
                    });
                    this.onload(event);
                }
                return;
            }

            return oldSend.call(this, data);
        };

        // 重新定义response属性
        Object.defineProperty(XMLHttpRequest.prototype, "response", {
            get: function (this: XMLHttpRequest & { zipCacheUrl?: string }) {
                if (this.zipCacheUrl) {
                    const res = ResCache.get(this.zipCacheUrl);
                    return this.responseType === "json" ? JSON.parse(res) : res;
                }
                return accessor.get ? accessor.get.call(this) : undefined;
            },
            set: function () {},
            configurable: true
        });
    }
}
