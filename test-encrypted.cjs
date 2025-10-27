const fs = require('fs');
const { deflateSync } = require('fflate');

// 复制 bundleZip.js 中的加密逻辑
function encryptData(data, password) {
    if (!password) return data;
    
    const passwordBytes = Buffer.from(password, 'utf8');
    const encryptedData = Buffer.alloc(data.length);
    
    for (let i = 0; i < data.length; i++) {
        const keyByte = passwordBytes[i % passwordBytes.length];
        encryptedData[i] = data[i] ^ keyByte;
    }
    
    return encryptedData;
}

function decryptData(data, password) {
    if (!password) return data;
    
    const passwordBytes = Buffer.from(password, 'utf8');
    const decryptedData = new Uint8Array(data.length);
    
    for (let i = 0; i < data.length; i++) {
        const keyByte = passwordBytes[i % passwordBytes.length];
        decryptedData[i] = data[i] ^ keyByte;
    }
    
    return decryptedData;
}

// ZIP 文件结构相关常量
const ZIP_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const ZIP_FLAGS = 0;
const ZIP_COMPRESSION_DEFLATE = 8;
const ZIP_COMPRESSION_STORE = 0;
const ZIP_FLAG_ENCRYPTED = 1;

// CRC32 计算表
const CRC32_TABLE = [];
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC32_TABLE[i] = c;
}

// 计算 CRC32
function calculateCRC32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// 获取 DOS 时间戳
function getDosTimestamp() {
    const now = new Date();
    const year = now.getFullYear() - 1980;
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const second = Math.floor(now.getSeconds() / 2);
    
    const date = (year << 9) | (month << 5) | day;
    const time = (hour << 11) | (minute << 5) | second;
    
    return (date << 16) | time;
}

// 创建加密的 ZIP 文件
function createEncryptedZip() {
    console.log('创建加密的 ZIP 文件...');
    
    const password = "test123";
    const files = [
        { name: "test1.txt", content: "这是第一个测试文件的内容" },
        { name: "test2.json", content: JSON.stringify({ message: "这是第二个测试文件", data: [1, 2, 3] }) },
        { name: "test3.bin", content: Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]) }
    ];
    
    const buffers = [];
    let currentOffset = 0;
    const centralDirectoryEntries = [];
    
    // 处理每个文件
    for (const file of files) {
        console.log(`处理文件: ${file.name}`);
        
        const fileNameBytes = Buffer.from(file.name, 'utf8');
        const fileData = Buffer.from(file.content, 'utf8');
        
        // 压缩数据
        const compressedData = deflateSync(fileData);
        const compressionMethod = ZIP_COMPRESSION_DEFLATE;
        const crc32 = calculateCRC32(fileData);
        const isEncrypted = true;
        
        // 加密压缩数据
        const encryptedData = encryptData(compressedData, password);
        
        const compressedSize = encryptedData.length;
        const uncompressedSize = fileData.length;
        
        // 创建本地文件头
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(ZIP_SIGNATURE, 0);
        localHeader.writeUInt16LE(ZIP_VERSION, 4);
        localHeader.writeUInt16LE(isEncrypted ? ZIP_FLAG_ENCRYPTED : ZIP_FLAGS, 6);
        localHeader.writeUInt16LE(compressionMethod, 8);
        localHeader.writeUInt32LE(getDosTimestamp(), 10);
        localHeader.writeUInt32LE(crc32, 14);
        localHeader.writeUInt32LE(compressedSize, 18);
        localHeader.writeUInt32LE(uncompressedSize, 22);
        localHeader.writeUInt16LE(fileNameBytes.length, 26);
        localHeader.writeUInt16LE(0, 28);
        
        // 记录本地头偏移
        const localHeaderOffset = currentOffset;
        
        buffers.push(localHeader);
        buffers.push(fileNameBytes);
        buffers.push(encryptedData);
        
        currentOffset += localHeader.length + fileNameBytes.length + encryptedData.length;
        
        // 创建中央目录条目
        const centralEntry = Buffer.alloc(46);
        centralEntry.writeUInt32LE(ZIP_CENTRAL_SIGNATURE, 0);
        centralEntry.writeUInt16LE(ZIP_VERSION, 4);
        centralEntry.writeUInt16LE(ZIP_VERSION, 6);
        centralEntry.writeUInt16LE(isEncrypted ? ZIP_FLAG_ENCRYPTED : ZIP_FLAGS, 8);
        centralEntry.writeUInt16LE(compressionMethod, 10);
        centralEntry.writeUInt32LE(getDosTimestamp(), 12);
        centralEntry.writeUInt32LE(crc32, 16);
        centralEntry.writeUInt32LE(compressedSize, 20);
        centralEntry.writeUInt32LE(uncompressedSize, 24);
        centralEntry.writeUInt16LE(fileNameBytes.length, 28);
        centralEntry.writeUInt16LE(0, 30);
        centralEntry.writeUInt16LE(0, 32);
        centralEntry.writeUInt16LE(0, 34);
        centralEntry.writeUInt16LE(0, 36);
        centralEntry.writeUInt32LE(0, 38);
        centralEntry.writeUInt32LE(localHeaderOffset, 42);
        
        centralDirectoryEntries.push({
            centralEntry,
            fileNameBytes
        });
    }
    
    // 记录中央目录开始位置
    const centralDirectoryStart = currentOffset;
    
    // 添加中央目录
    for (const centralDirEntry of centralDirectoryEntries) {
        buffers.push(centralDirEntry.centralEntry);
        buffers.push(centralDirEntry.fileNameBytes);
        currentOffset += centralDirEntry.centralEntry.length + centralDirEntry.fileNameBytes.length;
    }
    
    const centralDirectorySize = currentOffset - centralDirectoryStart;
    
    // 添加中央目录结束记录
    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(ZIP_END_SIGNATURE, 0);
    endRecord.writeUInt16LE(0, 4);
    endRecord.writeUInt16LE(0, 6);
    endRecord.writeUInt16LE(files.length, 8);
    endRecord.writeUInt16LE(files.length, 10);
    endRecord.writeUInt32LE(centralDirectorySize, 12);
    endRecord.writeUInt32LE(centralDirectoryStart, 16);
    endRecord.writeUInt16LE(0, 20);
    
    buffers.push(endRecord);
    
    return Buffer.concat(buffers);
}

// 测试解密功能
function testDecryption() {
    console.log('测试解密功能...');
    
    const password = "test123";
    const testData = Buffer.from("这是测试数据", 'utf8');
    
    // 加密
    const encrypted = encryptData(testData, password);
    console.log(`原始数据: ${testData.toString('utf8')}`);
    console.log(`加密后长度: ${encrypted.length}`);
    
    // 解密
    const decrypted = decryptData(encrypted, password);
    console.log(`解密后数据: ${decrypted.toString('utf8')}`);
    
    // 验证
    const isMatch = testData.equals(decrypted);
    console.log(`解密验证: ${isMatch ? '成功' : '失败'}`);
    
    return isMatch;
}

// 测试解析加密的 ZIP 文件
function testParseEncryptedZip(zipData, password) {
    console.log('\n测试解析加密的 ZIP 文件...');
    
    const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength);
    
    // 查找中央目录结束记录
    let endRecordOffset = -1;
    for (let i = zipData.length - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === ZIP_END_SIGNATURE) {
            endRecordOffset = i;
            break;
        }
    }
    
    if (endRecordOffset === -1) {
        throw new Error("Invalid ZIP file: End record not found");
    }
    
    const centralDirEntries = view.getUint16(endRecordOffset + 10, true);
    const centralDirOffset = view.getUint32(endRecordOffset + 16, true);
    
    console.log(`ZIP 文件包含 ${centralDirEntries} 个文件`);
    
    // 解析文件
    let offset = centralDirOffset;
    const files = [];
    
    for (let i = 0; i < centralDirEntries; i++) {
        if (view.getUint32(offset, true) !== ZIP_CENTRAL_SIGNATURE) {
            throw new Error("Invalid ZIP file: Central directory signature not found");
        }
        
        const compressionMethod = view.getUint16(offset + 10, true);
        const compressedSize = view.getUint32(offset + 20, true);
        const uncompressedSize = view.getUint32(offset + 24, true);
        const fileNameLength = view.getUint16(offset + 28, true);
        const localHeaderOffset = view.getUint32(offset + 42, true);
        
        // 读取文件名
        const fileName = new TextDecoder().decode(
            new Uint8Array(zipData.buffer, zipData.byteOffset + offset + 46, fileNameLength)
        );
        
        files.push({
            name: fileName,
            compressedSize,
            uncompressedSize,
            compressionMethod,
            localHeaderOffset
        });
        
        offset += 46 + fileNameLength;
    }
    
    // 尝试解压文件
    for (const file of files) {
        console.log(`\n解压文件: ${file.name}`);
        
        try {
            // 读取本地文件头
            const localHeaderOffset = file.localHeaderOffset;
            if (view.getUint32(localHeaderOffset, true) !== ZIP_SIGNATURE) {
                throw new Error("Invalid ZIP file: Local header signature not found");
            }
            
            const flags = view.getUint16(localHeaderOffset + 6, true);
            const isEncrypted = (flags & ZIP_FLAG_ENCRYPTED) !== 0;
            console.log(`  加密状态: ${isEncrypted ? '已加密' : '未加密'}`);
            
            const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
            const localExtraFieldLength = view.getUint16(localHeaderOffset + 28, true);
            const fileDataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
            
            // 读取文件数据
            let fileData = new Uint8Array(zipData.buffer, zipData.byteOffset + fileDataOffset, file.compressedSize);
            
            // 如果文件加密，先解密
            if (isEncrypted && password) {
                console.log(`  使用密码解密: ${password}`);
                fileData = decryptData(fileData, password);
            }
            
            // 解压数据
            let uncompressedData;
            if (file.compressionMethod === ZIP_COMPRESSION_DEFLATE) {
                uncompressedData = deflateSync(fileData);
            } else {
                uncompressedData = fileData;
            }
            
            console.log(`  解压成功: ${uncompressedData.length} 字节`);
            
            // 显示内容
            const content = new TextDecoder().decode(uncompressedData);
            console.log(`  内容: ${content.substring(0, 100)}...`);
            
        } catch (error) {
            console.error(`  解压失败: ${error.message}`);
        }
    }
}

// 主测试函数
async function main() {
    try {
        console.log('=== 加密 ZIP 文件测试 ===\n');
        
        // 1. 测试加密/解密功能
        console.log('1. 测试加密/解密功能:');
        const encryptionTest = testDecryption();
        console.log(`加密解密测试: ${encryptionTest ? '通过' : '失败'}\n`);
        
        // 2. 创建加密的 ZIP 文件
        console.log('2. 创建加密的 ZIP 文件:');
        const encryptedZip = createEncryptedZip();
        console.log(`加密 ZIP 文件大小: ${encryptedZip.length} 字节\n`);
        
        // 3. 保存到文件
        const zipPath = './encrypted-test.zip';
        fs.writeFileSync(zipPath, encryptedZip);
        console.log(`已保存到: ${zipPath}\n`);
        
        // 4. 测试解析加密的 ZIP 文件
        console.log('3. 测试解析加密的 ZIP 文件:');
        testParseEncryptedZip(encryptedZip, "test123");
        
        console.log('\n=== 测试完成 ===');
        
    } catch (error) {
        console.error('测试失败:', error);
    }
}

// 运行测试
main();
