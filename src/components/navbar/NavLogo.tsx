import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LogoIcon from '../../../src-tauri/icons/icon.png';
import { useAppVersion } from '../../hooks/useAppVersion';

export function NavLogo() {
    const { t } = useTranslation();
    const version = useAppVersion();

    return (
        <Link to="/" draggable="false" className="flex w-full min-w-0 items-center gap-2 text-xl font-semibold text-gray-900 dark:text-base-content group">
            <div className="relative flex items-center justify-center shrink-0">
                <img
                    src={LogoIcon}
                    alt="Logo"
                    className="w-8 h-8 cursor-pointer active:scale-95 transition-transform relative z-10"
                    draggable="false"
                />
            </div>

            {/* 父容器宽度 < 160px 隐藏 */}
            <span className="hidden @[160px]/logo:inline text-nowrap font-bold tracking-tight">
                {t('common.app_name', 'Antigravity Tools')}
            </span>

            {/* 版本号微型徽章 */}
            <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 leading-none shrink-0 select-none">
                v{version}
            </span>
        </Link>
    );
}
