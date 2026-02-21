import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['tabs', 'scripting', 'storage', 'unlimitedStorage'],
    host_permissions: [
      'https://prolodev.prologistics.info/shop_banners.php*',
      'https://www.prologistics.info/shop_banners.php*',
      'https://prolodev.prologistics.info/shop_banner.php*',
      'https://www.prologistics.info/shop_banner.php*',
      'https://prolodev.prologistics.info/',
      'https://prolodev.prologistics.info/start.php',
      'https://prolodev.prologistics.info/timestamp_filter.php',
      'http://localhost/*',
    ],
    content_scripts: [
  {
    "matches": ["*://*.prologistics.info/shop_banner.php*"],
    "js": ["content-fill.js"],   // plik z Twoimi funkcjami + auto-wywoływaniem po load
    "run_at": "document_idle"
  }
]
  },
  webExt: {
    openDevtools: true,
    disabled: true,
    startUrls: ['https://prologistics.info', 'https://prolodev.prologistics.info'],
    keepProfileChanges: true,
  },
});
