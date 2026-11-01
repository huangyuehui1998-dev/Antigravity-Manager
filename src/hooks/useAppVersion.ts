import { useState, useEffect } from 'react';
import { isTauri } from '../utils/env';

export const DEFAULT_APP_VERSION = '5.1.0';

/**
 * 获取应用版本号 Hook
 * 优先从 Tauri API 获取真实应用版本，非 Tauri 环境或初始化前回退到构建常量
 */
export function useAppVersion(): string {
    const [version, setVersion] = useState<string>(DEFAULT_APP_VERSION);

    useEffect(() => {
        if (isTauri()) {
            import('@tauri-apps/api/app')
                .then(({ getVersion }) => {
                    getVersion()
                        .then((v) => {
                            if (v) setVersion(v);
                        })
                        .catch(() => {});
                })
                .catch(() => {});
        }
    }, []);

    return version;
}
