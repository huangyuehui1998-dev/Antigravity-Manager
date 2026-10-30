import type { LucideIcon } from 'lucide-react';

// 类型定义
export interface NavItem {
    path: string;
    label: string;
    icon: LucideIcon;
    priority: 'high' | 'medium' | 'low';
}

export interface Language {
    code: string;
    label: string;
    short: string;
}

// 语言配置
export const LANGUAGES: Language[] = [
    { code: 'zh', label: '简体中文', short: 'ZH' },
    { code: 'zh-TW', label: '繁體中文', short: 'TW' },
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'ja', label: '日本語', short: 'JA' },
    { code: 'tr', label: 'Türkçe', short: 'TR' },
    { code: 'vi', label: 'Tiếng Việt', short: 'VI' },
    { code: 'pt', label: 'Português', short: 'PT' },
    { code: 'ko', label: '한국어', short: 'KO' },
    { code: 'ru', label: 'Русский', short: 'RU' },
    { code: 'ar', label: 'العربية', short: 'AR' },
    { code: 'es', label: 'Español', short: 'ES' },
    { code: 'my', label: 'Bahasa Melayu', short: 'MY' },
];

// 核心功能域前缀与聚合关系映射
const DOMAIN_MAPPING: Record<string, string[]> = {
    '/api-proxy': ['/api-proxy', '/user-token', '/security'],
    '/analytics': ['/analytics', '/financial-dashboard', '/token-stats', '/monitor'],
    '/accounts': ['/accounts'],
    '/settings': ['/settings'],
};

// 增强型工具函数
export const isRouteActive = (pathname: string, itemPath: string): boolean => {
    if (itemPath === '/') {
        return pathname === '/' || pathname === '/index.html';
    }
    const matchingPaths = DOMAIN_MAPPING[itemPath] || [itemPath];
    return matchingPaths.some(p => pathname === p || pathname.startsWith(`${p}/`));
};

export const isActive = isRouteActive;

export const getCurrentNavItem = (pathname: string, navItems: NavItem[]): NavItem => {
    return navItems.find(item => isRouteActive(pathname, item.path)) || navItems[0];
};
