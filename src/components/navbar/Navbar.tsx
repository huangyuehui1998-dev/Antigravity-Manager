import { LayoutDashboard, Users, Network, BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../../stores/useConfigStore';
import { isLinux } from '../../utils/env';
import { NavLogo } from './NavLogo';
import { NavMenu } from './NavMenu';
import { NavSettings } from './NavSettings';
import type { NavItem } from './constants';

/**
 * Navbar 主组件 - 4 大核心黄金入口
 */
function Navbar() {
    const { t } = useTranslation();
    const { config, updateLanguage, updateTheme } = useConfigStore();

    // 4 大黄金功能域收敛
    const navItems: NavItem[] = [
        { path: '/', label: t('nav.dashboard', '控制台'), icon: LayoutDashboard, priority: 'high' },
        { path: '/accounts', label: t('nav.accounts', '账号矩阵'), icon: Users, priority: 'high' },
        { path: '/analytics', label: t('nav.analytics', '统一分析中心'), icon: BarChart3, priority: 'high' },
        { path: '/api-proxy', label: t('nav.proxy', '本地网关中枢'), icon: Network, priority: 'high' },
    ];

    // 主题切换逻辑(带 View Transition 动画)
    const toggleTheme = async (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!config) return;

        const newTheme = config.theme === 'light' ? 'dark' : 'light';

        // Use View Transition API if supported, but skip on Linux (may cause crash)
        if ('startViewTransition' in document && !isLinux()) {
            const x = event.clientX;
            const y = event.clientY;
            const endRadius = Math.hypot(
                Math.max(x, window.innerWidth - x),
                Math.max(y, window.innerHeight - y)
            );

            // @ts-ignore
            const transition = document.startViewTransition(async () => {
                await updateTheme(newTheme);
            });

            transition.ready.then(() => {
                const isDarkMode = newTheme === 'dark';
                const clipPath = isDarkMode
                    ? [`circle(${endRadius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`]
                    : [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`];

                document.documentElement.animate(
                    {
                        clipPath: clipPath
                    },
                    {
                        duration: 500,
                        easing: 'ease-in-out',
                        fill: 'forwards',
                        pseudoElement: isDarkMode ? '::view-transition-old(root)' : '::view-transition-new(root)'
                    }
                );
            });
        } else {
            await updateTheme(newTheme);
        }
    };

    const handleLanguageChange = (langCode: string) => {
        updateLanguage(langCode).catch(err => {
            console.error('Failed to update language:', err);
        });
    };

    return (
        <nav
            style={{ position: 'sticky', top: 0, zIndex: 40 }}
            className="transition-all duration-200 bg-[#FAFBFC] dark:bg-[#0B0F17] border-b border-black/[0.04] dark:border-white/[0.06]"
        >
            <div className="max-w-7xl mx-auto px-6 relative" style={{ zIndex: 10 }}>
                <div className="flex items-center h-14 gap-4">
                    {/* Logo */}
                    <div className="@container/logo basis-[180px] shrink min-w-0">
                        <NavLogo />
                    </div>

                    {/* 4 大核心导航菜单 */}
                    <div className="flex-1 flex justify-center">
                        <NavMenu navItems={navItems} />
                    </div>

                    {/* 设置按钮 */}
                    <NavSettings
                        theme={(config?.theme as 'light' | 'dark') || 'light'}
                        currentLanguage={config?.language || 'en'}
                        onThemeToggle={toggleTheme}
                        onLanguageChange={handleLanguageChange}
                    />
                </div>
            </div>
        </nav>
    );
}

export default Navbar;
