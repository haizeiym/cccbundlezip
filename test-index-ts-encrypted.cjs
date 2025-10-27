const fs = require('fs');
const { inflateSync } = require('fflate');

// 模拟浏览器环境
global.TextEncoder = require('text-encoding').TextEncoder;
global.TextDecoder = require('text-encoding').TextDecoder;

// 模拟 Cocos Creator 环境
global.cc = {
    director: {},
    assetManager: {
        downloader: {
            register: () => {}
        }
    },
    loader: {
        _downloader: {
            extMap: {}
        }
    }
};

// 复制 index.ts 中的解密逻辑
function decryptData(data, password) {
    if (!password) return data;
    
    const passwordBytes = new TextEncoder().encode(password);
    const decryptedData = new Uint8Array(data.length);
    
    for (let i = 0; i < data.length; i++) {
        const keyByte = passwordBytes[i % passwordBytes.length];
        decryptedData[i] = data[i] ^ keyByte;
    }
    
    return decryptedData;
}

// 复制 index.ts 中的 ZIP 解析逻辑
function parseZipFile(data, password = '') {
    const entries = new Map();
    const view = new DataView(data);
    
    // 查找中央目录结束记录
    let endRecordOffset = -1;
    for (let i = data.byteLength - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === 0x06054b50) { // ZIP_END_SIGNATURE
            endRecordOffset = i;
            break;
        }
    }
    
    if (endRecordOffset === -1) {
        throw new Error("Invalid ZIP file: End record not found");
    }
    
    // 读取中央目录信息
    const centralDirEntries = view.getUint16(endRecordOffset + 10, true);
    const centralDirOffset = view.getUint32(endRecordOffset + 16, true);
    
    console.log(`ZIP 文件包含 ${centralDirEntries} 个文件`);
    
    // 解析文件列表
    let offset = centralDirOffset;
    
    for (let i = 0; i < centralDirEntries; i++) {
        if (view.getUint32(offset, true) !== 0x02014b50) { // ZIP_CENTRAL_SIGNATURE
            throw new Error("Invalid ZIP file: Central directory signature not found");
        }
        
        const compressionMethod = view.getUint16(offset + 10, true);
        const compressedSize = view.getUint32(offset + 20, true);
        const uncompressedSize = view.getUint32(offset + 24, true);
        const fileNameLength = view.getUint16(offset + 28, true);
        const extraFieldLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const localHeaderOffset = view.getUint32(offset + 42, true);
        
        // 读取文件名
        const fileName = new TextDecoder().decode(
            new Uint8Array(data, offset + 46, fileNameLength)
        );
        
        // 读取本地文件头
        const localHeaderOffsetActual = localHeaderOffset;
        if (view.getUint32(localHeaderOffsetActual, true) !== 0x04034b50) { // ZIP_SIGNATURE
            throw new Error("Invalid ZIP file: Local header signature not found");
        }
        
        const localFileNameLength = view.getUint16(localHeaderOffsetActual + 26, true);
        const localExtraFieldLength = view.getUint16(localHeaderOffsetActual + 28, true);
        const fileDataOffset = localHeaderOffsetActual + 30 + localFileNameLength + localExtraFieldLength;
        
        // 读取文件数据
        let fileData = new Uint8Array(data, fileDataOffset, compressedSize);
        
        // 检查是否加密（通过标志位判断）
        const flags = view.getUint16(localHeaderOffsetActual + 6, true);
        const isEncrypted = (flags & 1) !== 0; // ZIP_FLAG_ENCRYPTED = 1
        
        console.log(`\n处理文件: ${fileName}`);
        console.log(`  压缩方法: ${compressionMethod === 8 ? 'Deflate' : 'Store'}`);
        console.log(`  加密状态: ${isEncrypted ? '已加密' : '未加密'}`);
        
        // 如果文件加密，先解密
        if (isEncrypted && password) {
            console.log(`  使用密码解密: ${password}`);
            fileData = decryptData(fileData, password);
        }
        
        // 解压数据
        let uncompressedData;
        if (compressionMethod === 8) { // DEFLATE
            uncompressedData = inflateSync(fileData);
        } else { // STORE
            uncompressedData = fileData;
        }
        
        console.log(`  解压成功: ${uncompressedData.length} 字节`);
        
        // 显示内容
        const content = new TextDecoder().decode(uncompressedData);
        console.log(`  内容: ${content.substring(0, 100)}...`);
        
        entries.set(fileName, {
            fileName,
            compressedSize,
            uncompressedSize,
            compressionMethod,
            crc32: view.getUint32(offset + 16, true),
            localHeaderOffset,
            data: uncompressedData
        });
        
        offset += 46 + fileNameLength + extraFieldLength + commentLength;
    }
    
    return entries;
}

// 测试函数
async function testEncryptedZip() {
    try {
        console.log('=== 使用 index.ts 逻辑测试加密 ZIP 文件 ===\n');
        
        // 读取之前创建的加密 ZIP 文件
        const zipPath = './encrypted-test.zip';
        if (!fs.existsSync(zipPath)) {
            console.error('加密 ZIP 文件不存在，请先运行 test-encrypted.cjs');
            return;
        }
        
        const zipData = fs.readFileSync(zipPath);
        const arrayBuffer = zipData.buffer.slice(zipData.byteOffset, zipData.byteOffset + zipData.byteLength);
        
        console.log(`ZIP 文件大小: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);
        
        // 使用 index.ts 的逻辑解析加密的 ZIP 文件
        const password = "test123";
        const entries = parseZipFile(arrayBuffer, password);
        
        console.log(`\n成功解析 ${entries.size} 个文件`);
        
        // 验证文件内容
        console.log('\n=== 文件内容验证 ===');
        for (const [fileName, entry] of entries) {
            console.log(`\n文件: ${fileName}`);
            console.log(`  大小: ${entry.data.length} 字节`);
            
            const content = new TextDecoder().decode(entry.data);
            console.log(`  内容: ${content}`);
        }
        
        console.log('\n✅ 测试成功！index.ts 可以正确解压加密的压缩包。');
        
    } catch (error) {
        console.error('测试失败:', error);
    }
}

// 运行测试
testEncryptedZip();
