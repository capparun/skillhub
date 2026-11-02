// Pinned against the reviewed official 0.0.22 extension in opencli-mcp 0.0.30.
export const SOURCE_MANIFEST_SHA256='57229bdce58655ff47574fe52fd8b5c2eeb4ba4e2d12e34909f403e67019ac8a';
export const PATCHED_BACKGROUND_SHA256='e2d651db68b5e573dc153f1f7cb5d3f0643ad396eabd3de3dc9868dad773a015';
export const COMPAT_NAME='Hunter MCP compatibility preview';
export const COMPAT_VERSION_NAME='hunter-0.3.0-alpha.1-'+PATCHED_BACKGROUND_SHA256;
export function verifyCompatManifest(manifest){
 if(manifest?.name!==COMPAT_NAME||manifest.version!=='0.0.22'||manifest.version_name!==COMPAT_VERSION_NAME||manifest.background?.service_worker!=='background.js'||manifest.background?.type!=='module')throw Error('兼容扩展构建标识不匹配；停止连接，不接受旧诊断副本');
 return {name:manifest.name,version:manifest.version,build:manifest.version_name,verification:'declared-build-metadata',note:'运行时核对构建声明；文件完整性须由安装前校验另行证明'};
}

// Public loader identity only; no private signing key is stored or required.
export const COMPAT_PUBLIC_KEY="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuagWNcKSeClNwUYWNqlWd8EmJt3wPJYOfd2E2TdKUSJLrNMaixdFHjfpMsrLtMGXJdlS4oi5cL/to9OsE2YCVTyZHzLUzU0973iUyWcq73rP0eWBDQOqs0N6oZDIKcGH9omSz690yAEAQ19DrUmPfLgWucE8CS/3bbHVvJMCQbumj744OUfNlV1buqUJqpzc1AEur1g6A2uGPKjdIc1XADQ/Bz6t2fQBLRX7KrsyXdBZn+tOevBwKtfCsIGMnmseX92lx5nHKXf7zlJ46g3oafkKyzQcnRnqizNEISP+WBxRyacg/C+k+NgwXf7CJWbm4whb5OvFNc6Yvaq/agfhVQIDAQAB";
export const COMPAT_EXTENSION_ID="ebhhcfiikojppnmkimkhcajpieelbglb";
