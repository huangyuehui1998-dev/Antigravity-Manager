import { Link, useLocation } from 'react-router-dom';
import { NavigationDropdown } from './NavDropdowns';
import { isRouteActive, getCurrentNavItem, type NavItem } from './constants';
import { useConfigStore } from '../../stores/useConfigStore';

interface NavMenuProps {
    navItems: NavItem[];
}

/**
 * 导航菜单组件 - 4 大核心域自适应排版
 *
 * 响应式策略:
 * - ≥ 768px (覆盖默认 1024px 窗口): 文字胶囊
 * - 480px - 768px: 图标胶囊 (带 Tooltip 提示)
 * - < 480px: 下拉菜单
 */
export function NavMenu({ navItems }: NavMenuProps) {
    const location = useLocation();
    const { isMenuItemHidden } = useConfigStore();

    // 过滤隐藏的菜单项
    const visibleNavItems = navItems.filter(item => !isMenuItemHidden(item.path));

    return (
        <>
            {/* 1. 文字胶囊导航 (≥ 768px 完整呈现文字，完美覆盖默认 1024px 桌面窗口) */}
            <nav className="max-[767px]:hidden flex items-center gap-1 bg-gray-100/80 dark:bg-base-200/90 rounded-full p-1 border border-black/[0.04] dark:border-white/[0.06]">
                {visibleNavItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        draggable="false"
                        className={`
                            px-4 py-1.5
                            rounded-full
                            text-xs
                            font-medium
                            transition-all
                            whitespace-nowrap
                            ${isRouteActive(location.pathname, item.path)
                                ? 'bg-[#6366F1] text-white shadow-sm'
                                : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200/80 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-base-300'
                            }
                        `}
                    >
                        {item.label}
                    </Link>
                ))}
            </nav>

            {/* 2. 紧凑图标导航 (480px - 768px 自适应收缩) */}
            <nav className="max-[479px]:hidden min-[768px]:hidden flex items-center gap-1 bg-gray-100/80 dark:bg-base-200/90 rounded-full p-1 border border-black/[0.04] dark:border-white/[0.06]">
                {visibleNavItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        draggable="false"
                        className={`
                            p-2
                            rounded-full
                            transition-all
                            ${isRouteActive(location.pathname, item.path)
                                ? 'bg-[#6366F1] text-white shadow-sm'
                                : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200/80 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-base-300'
                            }
                        `}
                        title={item.label}
                    >
                        <item.icon className="w-4 h-4" />
                    </Link>
                ))}
            </nav>

            {/* 3. 图标+文字下拉 (< 480px) */}
            <div className="min-[480px]:hidden block">
                <NavigationDropdown
                    navItems={visibleNavItems}
                    isActive={(path) => isRouteActive(location.pathname, path)}
                    getCurrentNavItem={() => getCurrentNavItem(location.pathname, visibleNavItems)}
                    onNavigate={() => { }}
                    showLabel={true}
                />
            </div>
        </>
    );
}
