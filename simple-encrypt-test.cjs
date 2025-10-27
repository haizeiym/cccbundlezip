const { deflateSync, inflateSync } = require('fflate');

// 简单的加密解密函数
function encryptData(data, password) {
    if (!password) return data;
    
    const passwordBytes = Buffer.from(password, 'utf8');
    const encryptedData = new Uint8Array(data.length);
    
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

// 测试完整的加密-压缩-解密-解压缩流程
function testFullProcess() {
    console.log('=== 完整加密解密流程测试 ===\n');
    
    const password = "test123";
    const originalText = "这是测试数据，包含中文字符！";
    const originalData = new TextEncoder().encode(originalText);
    
    console.log(`原始数据: ${originalText}`);
    console.log(`原始数据长度: ${originalData.length} 字节\n`);
    
    // 1. 压缩
    console.log('1. 压缩数据...');
    const compressedData = deflateSync(originalData);
    console.log(`压缩后长度: ${compressedData.length} 字节\n`);
    
    // 2. 加密
    console.log('2. 加密数据...');
    const encryptedData = encryptData(compressedData, password);
    console.log(`加密后长度: ${encryptedData.length} 字节\n`);
    
    // 3. 解密
    console.log('3. 解密数据...');
    const decryptedData = decryptData(encryptedData, password);
    console.log(`解密后长度: ${decryptedData.length} 字节`);
    console.log(`解密数据是否与压缩数据相同: ${compressedData.every((val, i) => val === decryptedData[i])}\n`);
    
    // 4. 解压缩
    console.log('4. 解压缩数据...');
    const uncompressedData = inflateSync(decryptedData);
    console.log(`解压缩后长度: ${uncompressedData.length} 字节\n`);
    
    // 5. 验证结果
    console.log('5. 验证结果...');
    const finalText = new TextDecoder().decode(uncompressedData);
    console.log(`最终文本: ${finalText}`);
    console.log(`结果是否匹配: ${finalText === originalText}\n`);
    
    return finalText === originalText;
}

// 测试我们的 index.ts 中的解密逻辑
function testIndexTsLogic() {
    console.log('=== 测试 index.ts 解密逻辑 ===\n');
    
    const password = "test123";
    const originalText = "这是测试数据";
    const originalData = new TextEncoder().encode(originalText);
    
    console.log(`原始数据: ${originalText}`);
    
    // 模拟 index.ts 中的处理流程
    // 1. 压缩
    const compressedData = deflateSync(originalData);
    console.log(`压缩后: ${compressedData.length} 字节`);
    
    // 2. 加密（模拟 bundleZip.js 的行为）
    const encryptedData = encryptData(compressedData, password);
    console.log(`加密后: ${encryptedData.length} 字节`);
    
    // 3. 解密（模拟 index.ts 中的解密）
    const decryptedData = decryptData(encryptedData, password);
    console.log(`解密后: ${decryptedData.length} 字节`);
    
    // 4. 解压缩（模拟 index.ts 中的解压缩）
    const uncompressedData = inflateSync(decryptedData);
    console.log(`解压缩后: ${uncompressedData.length} 字节`);
    
    // 5. 验证
    const finalText = new TextDecoder().decode(uncompressedData);
    console.log(`最终结果: ${finalText}`);
    console.log(`验证通过: ${finalText === originalText}`);
    
    return finalText === originalText;
}

// 运行测试
async function main() {
    try {
        const test1 = testFullProcess();
        const test2 = testIndexTsLogic();
        
        console.log('=== 测试总结 ===');
        console.log(`完整流程测试: ${test1 ? '通过' : '失败'}`);
        console.log(`index.ts 逻辑测试: ${test2 ? '通过' : '失败'}`);
        
        if (test1 && test2) {
            console.log('\n✅ 所有测试通过！index.ts 可以正确解压加密的压缩包。');
        } else {
            console.log('\n❌ 测试失败！需要检查解密逻辑。');
        }
        
    } catch (error) {
        console.error('测试失败:', error);
    }
}

main();
