import { Outlet } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Navbar from '../navbar/Navbar';
import ActiveAccountCapsule from '../navbar/ActiveAccountCapsule';
import BackgroundTaskRunner from '../common/BackgroundTaskRunner';
import ToastContainer from '../common/ToastContainer';
import { useViewStore } from '../../stores/useViewStore';
import MiniView from './MiniView';
import { useEffect } from 'react';
import { isTauri } from '../../utils/env';
import { ensureFullViewState } from '../../utils/windowManager';
import { useAppVersion } from '../../hooks/useAppVersion';

function Layout() {
    const { isMiniView } = useViewStore();
    const appVersion = useAppVersion();

    // Ensure correct window state when in Full View (not Mini View)
    useEffect(() => {
        if (!isMiniView && isTauri()) {
            ensureFullViewState();
        }
    }, [isMiniView]);

    if (!isTauri() && isMiniView) {
        return (
            <>
                <BackgroundTaskRunner />
                <ToastContainer />
                <MiniView />
            </>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-[#FAFBFC] dark:bg-[#0B0F17] select-none text-gray-900 dark:text-gray-100 overflow-hidden">
            {/* 顶部 32px 原生留白拖拽区与账号胶囊 (消除 zIndex 9999 遮挡) */}
            <header className="h-8 flex items-center justify-between px-4 bg-transparent border-b border-black/[0.04] dark:border-white/[0.06] select-none text-xs relative z-30">
                {/* 左侧：当前激活账号微型胶囊 */}
                <div className="flex items-center gap-2 z-10">
                    <ActiveAccountCapsule />
                </div>

                {/* 中间核心留白区：声明原生窗口拖拽 (双击最大化，拖动移动窗口) */}
                <div
                    className="flex-1 h-full cursor-default"
                    data-tauri-drag-region
                    onMouseDown={() => {
                        if (isTauri()) {
                            getCurrentWindow().startDragging();
                        }
                    }}
                />

                {/* 右侧微型标识 */}
                <div className="flex items-center gap-1.5 z-10 text-[11px] text-gray-400 opacity-70">
                    <span>Antigravity Tools</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.06] text-gray-500 dark:text-gray-400 border border-black/[0.06] dark:border-white/[0.08]">
                        v{appVersion}
                    </span>
                </div>
            </header>

            <BackgroundTaskRunner />
            <ToastContainer />
            <Navbar />
            <main className="flex-1 overflow-hidden flex flex-col relative">
                <Outlet />
            </main>
        </div>
    );
}

export default Layout;
