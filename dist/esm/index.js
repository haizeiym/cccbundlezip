var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
import { inflateSync } from "fflate";
// ZIP 文件结构相关常量
var ZIP_SIGNATURE = 0x04034b50;
var ZIP_CENTRAL_SIGNATURE = 0x02014b50;
var ZIP_END_SIGNATURE = 0x06054b50;
var ZIP_COMPRESSION_DEFLATE = 8;
var ZIP_COMPRESSION_STORE = 0;
// 简单的 ZIP 解密实现（使用 XOR 解密）
function decryptData(data, password) {
    if (!password)
        return data;
    var passwordBytes = new TextEncoder().encode(password);
    var decryptedData = new Uint8Array(data.length);
    for (var i = 0; i < data.length; i++) {
        var keyByte = passwordBytes[i % passwordBytes.length];
        decryptedData[i] = data[i] ^ keyByte;
    }
    return decryptedData;
}
// 资源缓存Map
var ResCache = new Map();
// ZIP文件缓存Map
var ZipCache = new Map();
// 解析 ZIP 文件
function parseZipFile(data, password) {
    if (password === void 0) { password = ''; }
    var entries = new Map();
    var view = new DataView(data);
    var offset = 0;
    // 查找中央目录结束记录
    var endRecordOffset = -1;
    for (var i = data.byteLength - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === ZIP_END_SIGNATURE) {
            endRecordOffset = i;
            break;
        }
    }
    if (endRecordOffset === -1) {
        throw new Error("Invalid ZIP file: End record not found");
    }
    // 读取中央目录结束记录
    var centralDirEntries = view.getUint16(endRecordOffset + 10, true);
    var centralDirOffset = view.getUint32(endRecordOffset + 16, true);
    // 解析中央目录
    offset = centralDirOffset;
    for (var i = 0; i < centralDirEntries; i++) {
        if (view.getUint32(offset, true) !== ZIP_CENTRAL_SIGNATURE) {
            throw new Error("Invalid ZIP file: Central directory signature not found");
        }
        var compressionMethod = view.getUint16(offset + 10, true);
        var compressedSize = view.getUint32(offset + 20, true);
        var uncompressedSize = view.getUint32(offset + 24, true);
        var fileNameLength = view.getUint16(offset + 28, true);
        var extraFieldLength = view.getUint16(offset + 30, true);
        var commentLength = view.getUint16(offset + 32, true);
        var localHeaderOffset = view.getUint32(offset + 42, true);
        // 读取文件名
        var fileName = new TextDecoder().decode(new Uint8Array(data, offset + 46, fileNameLength));
        // 读取本地文件头
        var localHeaderOffsetActual = localHeaderOffset;
        if (view.getUint32(localHeaderOffsetActual, true) !== ZIP_SIGNATURE) {
            throw new Error("Invalid ZIP file: Local header signature not found");
        }
        var localFileNameLength = view.getUint16(localHeaderOffsetActual + 26, true);
        var localExtraFieldLength = view.getUint16(localHeaderOffsetActual + 28, true);
        var fileDataOffset = localHeaderOffsetActual + 30 + localFileNameLength + localExtraFieldLength;
        // 读取文件数据
        var fileData = new Uint8Array(data, fileDataOffset, compressedSize);
        // 检查是否加密（通过标志位判断）
        var flags = view.getUint16(localHeaderOffsetActual + 6, true);
        var isEncrypted = (flags & 1) !== 0; // ZIP_FLAG_ENCRYPTED = 1
        // 如果文件加密，先解密
        if (isEncrypted && password) {
            fileData = decryptData(fileData, password);
        }
        // 解压数据
        var uncompressedData = void 0;
        if (compressionMethod === ZIP_COMPRESSION_DEFLATE) {
            uncompressedData = inflateSync(fileData);
        }
        else if (compressionMethod === ZIP_COMPRESSION_STORE) {
            uncompressedData = fileData;
        }
        else {
            throw new Error("Unsupported compression method: ".concat(compressionMethod));
        }
        entries.set(fileName, {
            fileName: fileName,
            compressedSize: compressedSize,
            uncompressedSize: uncompressedSize,
            compressionMethod: compressionMethod,
            crc32: view.getUint32(offset + 16, true),
            localHeaderOffset: localHeaderOffset,
            data: uncompressedData
        });
        offset += 46 + fileNameLength + extraFieldLength + commentLength;
    }
    return entries;
}
var ZipLoader = /** @class */ (function () {
    function ZipLoader() {
        this._isInit = false;
        this._remoteUrl = "";
        this._password = "";
    }
    Object.defineProperty(ZipLoader, "instance", {
        get: function () {
            if (!this._instance) {
                this._instance = new ZipLoader();
                this._instance._isInit = false;
            }
            return this._instance;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ZipLoader.prototype, "remoteUrl", {
        get: function () {
            return this._remoteUrl;
        },
        set: function (value) {
            this._remoteUrl = value;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(ZipLoader.prototype, "password", {
        get: function () {
            return this._password;
        },
        set: function (value) {
            this._password = value;
        },
        enumerable: false,
        configurable: true
    });
    ZipLoader.prototype.getZipCache = function () {
        return ZipCache;
    };
    ZipLoader.prototype.getResCache = function () {
        return ResCache;
    };
    /**
     * 下载zip文件
     */
    ZipLoader.prototype.downloadZip = function (path) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.responseType = "arraybuffer";
            xhr.onload = function () {
                if (xhr.status === 200) {
                    resolve(xhr.response);
                }
                else {
                    reject(new Error("Download failed: ".concat(xhr.status)));
                }
            };
            xhr.onerror = function () { return reject(new Error("Download failed")); };
            xhr.open("GET", path + ".zip", true);
            xhr.send();
        });
    };
    /**
     * 注入图片下载处理
     */
    ZipLoader.prototype._injectDownloadImage = function (extension) {
        var _a, _b;
        // 图片大小阈值：2MB
        var SIZE_THRESHOLD = 2 * 1024 * 1024;
        // 纹理压缩格式，不能直接用Image加载
        var textureFormats = ['.astc', '.pvr', '.ktx', '.dds'];
        var isTextureFormat = textureFormats.indexOf(extension) !== -1;
        var downloadHandler = function (url, options, onComplete) {
            if (ResCache.has(url)) {
                var res = ResCache.get(url);
                onComplete(null, res);
                return;
            }
            if (ZipCache.has(url)) {
                var cache_1 = ZipCache.get(url);
                if (cache_1) {
                    cache_1
                        .async("uint8array")
                        .then(function (data) {
                        if (isTextureFormat) {
                            // 纹理格式直接返回ArrayBuffer数据
                            ResCache.set(url, data);
                            ZipCache.delete(url);
                            onComplete(null, data);
                        }
                        else if (data.length > SIZE_THRESHOLD) {
                            return cache_1.async("blob").then(function (blob) {
                                var objectUrl = URL.createObjectURL(blob);
                                var img = new Image();
                                img.crossOrigin = "anonymous";
                                img.onload = function () {
                                    URL.revokeObjectURL(objectUrl);
                                    ResCache.set(url, img);
                                    ZipCache.delete(url);
                                    onComplete(null, img);
                                };
                                img.onerror = function (e) {
                                    URL.revokeObjectURL(objectUrl);
                                    onComplete(new Error(e instanceof Event ? e.type : String(e)), null);
                                };
                                img.src = objectUrl;
                            });
                        }
                        else {
                            return cache_1.async("base64").then(function (base64) {
                                var img = new Image();
                                img.crossOrigin = "anonymous";
                                img.onload = function () {
                                    ResCache.set(url, img);
                                    ZipCache.delete(url);
                                    onComplete(null, img);
                                };
                                img.onerror = function (e) {
                                    onComplete(new Error(e instanceof Event ? e.type : String(e)), null);
                                };
                                img.src = "data:image/".concat(extension.slice(1), ";base64,").concat(base64);
                            });
                        }
                    })
                        .catch(function (error) {
                        console.error("[ZipLoader] Load image failed:", error);
                        onComplete(error, null);
                    });
                    return;
                }
            }
            if (isTextureFormat) {
                // 纹理格式直接下载ArrayBuffer
                var xhr_1 = new XMLHttpRequest();
                xhr_1.responseType = "arraybuffer";
                xhr_1.onload = function () {
                    if (xhr_1.status === 200) {
                        ResCache.set(url, xhr_1.response);
                        onComplete(null, xhr_1.response);
                    }
                    else {
                        onComplete(new Error("Download failed: ".concat(xhr_1.status)), null);
                    }
                };
                xhr_1.onerror = function () { return onComplete(new Error("Download failed"), null); };
                xhr_1.open("GET", url, true);
                xhr_1.send();
            }
            else {
                var img_1 = new Image();
                img_1.crossOrigin = "anonymous";
                img_1.onload = function () { return onComplete(null, img_1); };
                img_1.onerror = function (e) { return onComplete(new Error(e instanceof Event ? e.type : String(e)), null); };
                img_1.src = url;
            }
        };
        // 兼容 CocosCreator 2.4.14 和 3.8.5
        if ((_a = cc.assetManager) === null || _a === void 0 ? void 0 : _a.downloader) {
            // CocosCreator 3.x
            cc.assetManager.downloader.register(extension, downloadHandler);
        }
        else if ((_b = cc.loader) === null || _b === void 0 ? void 0 : _b._downloader) {
            // CocosCreator 2.x
            cc.loader._downloader.extMap[extension.slice(1)] = downloadHandler;
        }
    };
    /**
     * 初始化图片加载器
     */
    ZipLoader.prototype._initImageLoaders = function () {
        var _this = this;
        // 支持的图片格式
        var imageExtensions = [
            ".png", ".jpg", ".jpeg", ".webp", ".bmp",
            ".astc", ".pvr", ".ktx", ".dds" // 纹理压缩格式
        ];
        // 注册所有支持的图片格式
        imageExtensions.forEach(function (ext) {
            _this._injectDownloadImage(ext);
        });
    };
    /**
     * 加载并解析zip包
     */
    ZipLoader.prototype.loadZip = function (bundleName, onProgress) {
        return __awaiter(this, void 0, void 0, function () {
            var zipData, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        if (!this._isInit) {
                            this._initImageLoaders();
                            this._hookXMLHttpRequest();
                            this._isInit = true;
                        }
                        return [4 /*yield*/, this.downloadZip("".concat(this._remoteUrl, "/").concat(bundleName))];
                    case 1:
                        zipData = _a.sent();
                        // 解析zip内容
                        return [4 /*yield*/, this._parseZip(zipData, bundleName)];
                    case 2:
                        // 解析zip内容
                        _a.sent();
                        // 调用进度回调
                        onProgress === null || onProgress === void 0 ? void 0 : onProgress(1);
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _a.sent();
                        console.error("[ZipLoader] Load zip failed:", error_1);
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 解析zip内容
     */
    ZipLoader.prototype._parseZip = function (data, bundleName) {
        return __awaiter(this, void 0, void 0, function () {
            var entries, isVersion3, cachePath, _loop_1, entries_1, entries_1_1, _a, path, entry;
            var e_1, _b;
            return __generator(this, function (_c) {
                try {
                    entries = parseZipFile(data, this._password);
                    isVersion3 = 'root' in cc.director;
                    cachePath = isVersion3 ? 'remote' : 'assets';
                    console.log("cachePath", cachePath);
                    _loop_1 = function (path, entry) {
                        // 缓存zip文件，创建一个类似 JSZip 文件对象的接口
                        var fullPath = "".concat(cachePath, "/").concat(bundleName, "/").concat(path);
                        var fileObject = {
                            name: path,
                            dir: false,
                            async: function (type) {
                                return new Promise(function (resolve, reject) {
                                    try {
                                        switch (type) {
                                            case "uint8array":
                                                resolve(entry.data);
                                                break;
                                            case "text":
                                                resolve(new TextDecoder().decode(entry.data));
                                                break;
                                            case "base64":
                                                var base64 = btoa(String.fromCharCode.apply(String, __spreadArray([], __read(entry.data), false)));
                                                resolve(base64);
                                                break;
                                            case "blob":
                                                var blob = new Blob([entry.data]);
                                                resolve(blob);
                                                break;
                                            default:
                                                resolve(entry.data);
                                        }
                                    }
                                    catch (error) {
                                        reject(error);
                                    }
                                });
                            }
                        };
                        ZipCache.set(fullPath, fileObject);
                    };
                    try {
                        // 遍历所有文件
                        for (entries_1 = __values(entries), entries_1_1 = entries_1.next(); !entries_1_1.done; entries_1_1 = entries_1.next()) {
                            _a = __read(entries_1_1.value, 2), path = _a[0], entry = _a[1];
                            _loop_1(path, entry);
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (entries_1_1 && !entries_1_1.done && (_b = entries_1.return)) _b.call(entries_1);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                }
                catch (error) {
                    console.error("[ZipLoader] Parse zip failed:", error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * 拦截XMLHttpRequest请求
     */
    ZipLoader.prototype._hookXMLHttpRequest = function () {
        if (this._isInit)
            return;
        this._isInit = true;
        var accessor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "response");
        if (!accessor)
            return;
        var oldOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, async, username, password) {
            if (ZipCache.has(url)) {
                this.zipCacheUrl = url;
            }
            else {
                this.zipCacheUrl = undefined;
            }
            return oldOpen.call(this, method, url, async !== null && async !== void 0 ? async : true, username, password);
        };
        var oldSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (data) {
            return __awaiter(this, void 0, void 0, function () {
                var cache, text, res, error_2, errorEvent, event_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            if (!this.zipCacheUrl) return [3 /*break*/, 8];
                            if (!!ResCache.has(this.zipCacheUrl)) return [3 /*break*/, 7];
                            cache = ZipCache.get(this.zipCacheUrl);
                            if (!cache) return [3 /*break*/, 7];
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 6, , 7]);
                            if (!(this.responseType === "json")) return [3 /*break*/, 3];
                            return [4 /*yield*/, cache.async("text")];
                        case 2:
                            text = _a.sent();
                            ResCache.set(this.zipCacheUrl, text);
                            return [3 /*break*/, 5];
                        case 3: return [4 /*yield*/, cache.async(this.responseType || "text")];
                        case 4:
                            res = _a.sent();
                            ResCache.set(this.zipCacheUrl, res);
                            _a.label = 5;
                        case 5:
                            ZipCache.delete(this.zipCacheUrl);
                            return [3 /*break*/, 7];
                        case 6:
                            error_2 = _a.sent();
                            if (this.onerror) {
                                errorEvent = new ProgressEvent("error", {
                                    lengthComputable: false,
                                    loaded: 0,
                                    total: 0
                                });
                                this.onerror(errorEvent);
                            }
                            return [2 /*return*/];
                        case 7:
                            if (typeof this.onload === "function") {
                                event_1 = new ProgressEvent("load", {
                                    lengthComputable: false,
                                    loaded: 0,
                                    total: 0
                                });
                                this.onload(event_1);
                            }
                            return [2 /*return*/];
                        case 8: return [2 /*return*/, oldSend.call(this, data)];
                    }
                });
            });
        };
        // 重新定义response属性
        Object.defineProperty(XMLHttpRequest.prototype, "response", {
            get: function () {
                if (this.zipCacheUrl) {
                    var res = ResCache.get(this.zipCacheUrl);
                    return this.responseType === "json" ? JSON.parse(res) : res;
                }
                return accessor.get ? accessor.get.call(this) : undefined;
            },
            set: function () { },
            configurable: true
        });
    };
    ZipLoader._instance = null;
    return ZipLoader;
}());
export { ZipLoader };
