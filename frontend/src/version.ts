declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
declare const __BUILD_DATE__: string;

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';
export const GIT_COMMIT = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : 'cmds-2026';
export const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '2026-11-13';
export const VERSION_DISPLAY = `v${APP_VERSION}`;
export const VERSION_TOOLTIP = `Versión v${APP_VERSION} (${BUILD_DATE}) · Sistema Control Licencias Microsoft 365 CMDS`;
